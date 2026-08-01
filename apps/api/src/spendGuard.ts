/**
 * A hard ceiling on how many billed image-model calls this process will make per day.
 *
 * The rate limiters are per-IP and per-window: they stop one visitor hammering the
 * service, and they are the right tool for that. They do not stop the thing that actually
 * empties a wallet, which is *many* callers each staying politely under the limit, or one
 * caller rotating addresses.
 *
 * The image endpoints hold a server-side OpenAI key and are unauthenticated by design —
 * the whole point is that a visitor can try the feature without signing up. That is fine
 * until the URL is public, at which point the key is a free image generator for the
 * internet. This is the backstop: a number the operator sets, after which generation
 * refuses until the day rolls over, whatever the traffic looks like.
 *
 * Deliberately in-process and in-memory, matching the rate limiters. With more than one
 * replica the effective ceiling is `replicas x max`, so the docs tell operators to divide.
 * A shared counter means Redis, and a service that cannot start without Redis is a worse
 * default than one that over-counts by a known factor.
 */

export interface SpendGuardOptions {
  /** Billed calls permitted per UTC day. `0` disables generation entirely. */
  maxPerDay: number;
}

export interface SpendGuard {
  /** Reserve one call. `false` means the budget is spent — do not call the model. */
  tryConsume(): boolean;
  /** Hand a reservation back when the call never happened (validation failure, cache hit). */
  refund(): void;
  status(): { used: number; maxPerDay: number; remaining: number; resetsAt: string };
}

const dayKey = (now: number): string => new Date(now).toISOString().slice(0, 10);

/** Midnight UTC after `now`, which is when the counter rolls over. */
const nextReset = (now: number): string => {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
};

export function createSpendGuard(
  options: SpendGuardOptions,
  now: () => number = Date.now,
): SpendGuard {
  const maxPerDay = Math.max(0, options.maxPerDay);
  let day = dayKey(now());
  let used = 0;

  const roll = () => {
    const current = dayKey(now());
    if (current !== day) {
      day = current;
      used = 0;
    }
  };

  return {
    tryConsume() {
      roll();
      if (used >= maxPerDay) return false;
      used += 1;
      return true;
    },
    refund() {
      roll();
      // Never below zero: a refund arriving after a day roll must not create budget.
      if (used > 0) used -= 1;
    },
    status() {
      roll();
      const t = now();
      return { used, maxPerDay, remaining: Math.max(0, maxPerDay - used), resetsAt: nextReset(t) };
    },
  };
}

/**
 * Read the daily cap from the environment.
 *
 * The default is deliberately small. Someone deploying this publicly for the first time
 * should discover the ceiling by hitting it, not by reading a bill — so the failure mode
 * of forgetting to configure it is "the demo stopped working", not "the card was charged".
 */
export function resolveDailyImageBudget(env = process.env): number {
  const raw = env.IMAGE_DAILY_MAX?.trim();
  if (raw === undefined || raw === "") return 100;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 100;
}
