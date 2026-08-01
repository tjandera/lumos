/**
 * Per-key (per-IP) fixed-window rate limiting for the routes that call a metered provider.
 *
 * The counter itself now lives in `usage/counterStore.ts` — Postgres when a database is
 * configured, process memory otherwise. That indirection is the whole point: this used to
 * be a `Map` inside one process, so a configured "30 requests per 5 minutes" was really
 * 30 x replicas, and nothing in the response said which pod had answered.
 *
 * Checks are async because a shared counter means a round trip. Free in context: the
 * routes this guards then spend thirty seconds or more inside an image model.
 */
import type { CounterStore } from "../usage/counterStore.js";

export interface RateLimitOptions {
  /** Window length in ms. Defaults to 60s. */
  windowMs?: number;
  /** Max requests allowed per key per window. Defaults to 20. */
  max?: number;
}

/** Resolves `true` if the request may proceed, `false` if it should be refused with 429. */
export type RateLimitCheck = (key: string) => Promise<boolean>;

/**
 * Build a checker over `store`.
 *
 * `namespace` keeps the chat, light-study and image-day budgets in separate buckets —
 * without it, using the assistant would eat into the same visitor's image allowance.
 */
export function createRateLimiter(
  store: CounterStore,
  namespace: string,
  options: RateLimitOptions = {},
): RateLimitCheck {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 20;

  return async function check(key: string): Promise<boolean> {
    try {
      const { count } = await store.hit(`rl:${namespace}:${key}`, windowMs);
      return count <= max;
    } catch {
      // Fail closed. These limiters guard spend, and the readiness probe already removes
      // a pod whose database is unreachable from the Service — so "the counter is
      // unavailable" must not quietly become "the limits are off".
      return false;
    }
  };
}
