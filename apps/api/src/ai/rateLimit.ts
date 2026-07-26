/**
 * Simple in-memory per-key (per-IP) fixed-window rate limiter for the AI
 * route. Intentionally minimal — single-process, no external store — since
 * the AI proxy is the only endpoint that calls out to a (potentially
 * metered) LLM provider and needs basic abuse protection, not a general
 * rate-limiting subsystem.
 */

export interface RateLimitOptions {
  /** Window length in ms. Defaults to 60s. */
  windowMs?: number;
  /** Max requests allowed per key per window. Defaults to 20. */
  max?: number;
}

export type RateLimitCheck = (key: string) => boolean;

/**
 * Create a rate-limit checker. Returns a function that returns `true` if the
 * request identified by `key` is allowed, `false` if it should be rejected
 * (429). `now` is injectable for deterministic tests.
 */
export function createRateLimiter(options: RateLimitOptions = {}, now: () => number = Date.now): RateLimitCheck {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 20;
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function check(key: string): boolean {
    const current = now();
    const entry = hits.get(key);
    if (!entry || current >= entry.resetAt) {
      hits.set(key, { count: 1, resetAt: current + windowMs });
      return true;
    }
    if (entry.count >= max) return false;
    entry.count += 1;
    return true;
  };
}
