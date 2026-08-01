/**
 * Windowed counters that survive having more than one replica.
 *
 * Rate limits and the daily spend ceiling were both per-process. With N replicas behind a
 * load balancer that quietly multiplies every limit by N: the "30 requests per 5 minutes"
 * an operator configured was really 30N, and a `IMAGE_DAILY_MAX` of 50 was a bill for 50N
 * images. Worse, it was invisible — nothing in the response says which pod answered.
 *
 * Postgres is the shared store rather than Redis because Postgres is *already* an optional
 * backend here. Adding Redis would mean a second piece of infrastructure and a service
 * that cannot start without it; reusing the connection that already exists costs nothing
 * and keeps the "no database configured" path working exactly as before.
 *
 * The whole contract is one atomic statement — read, expire, increment and return, with no
 * read-then-write gap for two replicas to race through.
 */
import type { PgPool } from "../db/pool.js";

export interface CounterHit {
  /** Count *after* this hit, within the current window. */
  count: number;
  /** When the current window ends. */
  resetAt: Date;
}

export interface CounterStore {
  /** Increment `key`'s counter, starting a fresh `windowMs` window if the old one lapsed. */
  hit(key: string, windowMs: number): Promise<CounterHit>;
  /** Give one back — used when a reserved call never actually happened. */
  release(key: string): Promise<void>;
  /** Read without incrementing. */
  peek(key: string): Promise<CounterHit | null>;
}

/**
 * Single-process store. Correct when there is exactly one instance, which is the
 * `pnpm dev` and single-container case.
 */
export function createMemoryCounterStore(now: () => number = Date.now): CounterStore {
  const rows = new Map<string, { count: number; resetAt: number }>();
  let lastSweep = now();

  // Expired keys were never removed, so the map grew once per distinct IP forever. On a
  // public deployment that is visitor-driven memory growth.
  const sweep = (current: number) => {
    if (current - lastSweep < 60_000) return;
    lastSweep = current;
    for (const [k, v] of rows) if (current >= v.resetAt) rows.delete(k);
  };

  return {
    async hit(key, windowMs) {
      const current = now();
      sweep(current);
      const row = rows.get(key);
      if (!row || current >= row.resetAt) {
        const fresh = { count: 1, resetAt: current + windowMs };
        rows.set(key, fresh);
        return { count: 1, resetAt: new Date(fresh.resetAt) };
      }
      row.count += 1;
      return { count: row.count, resetAt: new Date(row.resetAt) };
    },
    async release(key) {
      const row = rows.get(key);
      if (row && row.count > 0) row.count -= 1;
    },
    async peek(key) {
      const row = rows.get(key);
      if (!row || now() >= row.resetAt) return null;
      return { count: row.count, resetAt: new Date(row.resetAt) };
    },
  };
}

/**
 * Shared store. Every replica sees one counter per key.
 *
 * `hit` is a single `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, so the expire-or-
 * increment decision happens inside one statement under the row lock Postgres already
 * takes for the conflict. Two replicas hitting the same key at the same instant serialise
 * on that row and get 1 and 2, never 1 and 1.
 */
export function createPostgresCounterStore(pool: PgPool): CounterStore {
  return {
    async hit(key, windowMs) {
      const { rows } = await pool.query<{ count: number; reset_at: Date }>(
        `INSERT INTO usage_counters (key, count, reset_at)
         VALUES ($1, 1, now() + ($2::bigint || ' milliseconds')::interval)
         ON CONFLICT (key) DO UPDATE SET
           count = CASE WHEN usage_counters.reset_at <= now() THEN 1
                        ELSE usage_counters.count + 1 END,
           reset_at = CASE WHEN usage_counters.reset_at <= now() THEN EXCLUDED.reset_at
                           ELSE usage_counters.reset_at END
         RETURNING count, reset_at`,
        [key, String(Math.max(1, Math.round(windowMs)))],
      );
      const row = rows[0]!;
      return { count: Number(row.count), resetAt: new Date(row.reset_at) };
    },

    async release(key) {
      // Only within a live window: a refund arriving after the window rolled must not
      // hand budget back to the *next* window.
      await pool.query(
        `UPDATE usage_counters SET count = GREATEST(count - 1, 0)
         WHERE key = $1 AND reset_at > now()`,
        [key],
      );
    },

    async peek(key) {
      const { rows } = await pool.query<{ count: number; reset_at: Date }>(
        `SELECT count, reset_at FROM usage_counters WHERE key = $1 AND reset_at > now()`,
        [key],
      );
      const row = rows[0];
      return row ? { count: Number(row.count), resetAt: new Date(row.reset_at) } : null;
    },
  };
}

/**
 * Housekeeping. Rows expire logically the moment `reset_at` passes, so this is only about
 * reclaiming space; nothing reads an expired row.
 */
export async function pruneUsageCounters(pool: PgPool): Promise<number> {
  const { rowCount } = await pool.query(`DELETE FROM usage_counters WHERE reset_at <= now()`);
  return rowCount ?? 0;
}
