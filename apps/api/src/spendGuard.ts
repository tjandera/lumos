/**
 * A hard ceiling on how many billed image-model calls this deployment will make per day.
 *
 * The rate limiters are per-IP and per-window: they stop one visitor hammering the
 * service, which is the right tool for that. They do not stop the thing that actually
 * empties a wallet — *many* callers each staying politely under the limit, or one caller
 * rotating addresses.
 *
 * The image endpoints hold a server-side OpenAI key and are unauthenticated by design:
 * the point is that a visitor can try the feature without signing up. That is fine until
 * the URL is public, at which point the key is a free image generator for the internet.
 * This is the backstop — a number the operator sets, after which generation refuses until
 * the day rolls over, whatever the traffic looks like.
 *
 * The counter is shared across replicas via `usage/counterStore.ts` when Postgres is
 * configured, so `IMAGE_DAILY_MAX` means what it says rather than "per pod".
 */
import type { CounterStore } from "./usage/counterStore.js";

export interface SpendGuard {
  /** Reserve one call. `false` means the budget is spent — do not call the model. */
  tryConsume(): Promise<boolean>;
  /** Hand a reservation back when the call never happened. */
  refund(): Promise<void>;
  status(): Promise<{ used: number; maxPerDay: number; remaining: number; resetsAt: string }>;
}

/** Counter key for the UTC day containing `now`, so the window lines up with a billing day. */
const dayKey = (now: number): string => `spend:image:${new Date(now).toISOString().slice(0, 10)}`;

/** Milliseconds until the next UTC midnight — the window length for today's counter. */
const msUntilUtcMidnight = (now: number): number => {
  const end = new Date(now);
  end.setUTCHours(24, 0, 0, 0);
  return end.getTime() - now;
};

export function createSpendGuard(
  store: CounterStore,
  maxPerDay: number,
  now: () => number = Date.now,
): SpendGuard {
  const cap = Math.max(0, Math.floor(maxPerDay));

  return {
    async tryConsume() {
      if (cap === 0) return false;
      const t = now();
      try {
        const { count } = await store.hit(dayKey(t), msUntilUtcMidnight(t));
        if (count <= cap) return true;
        // Over budget: give the increment straight back so a flood of refused requests
        // doesn't inflate the stored count far past the cap and skew `status()`.
        await store.release(dayKey(t));
        return false;
      } catch {
        // Fail closed — an unreachable counter must not become an unlimited budget.
        return false;
      }
    },

    async refund() {
      // Never below zero, and never into the next window: a refund arriving after
      // midnight must not hand budget to the new day.
      try {
        await store.release(dayKey(now()));
      } catch {
        /* best effort — losing one refund is far better than failing the request */
      }
    },

    async status() {
      const t = now();
      const resetsAt = new Date(t);
      resetsAt.setUTCHours(24, 0, 0, 0);
      let used = 0;
      try {
        used = (await store.peek(dayKey(t)))?.count ?? 0;
      } catch {
        // Report the budget as spent when we cannot tell; the UI then explains itself
        // instead of inviting a run that will be refused call by call.
        used = cap;
      }
      return {
        used: Math.min(used, cap),
        maxPerDay: cap,
        remaining: Math.max(0, cap - used),
        resetsAt: resetsAt.toISOString(),
      };
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
