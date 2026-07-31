/**
 * Run async work N-at-a-time, with retry on rate limiting.
 *
 * Image generation is ~30s of *waiting*, not of local work, so running a dozen of them
 * one after another spends most of its time idle. Four in flight turns a six-minute
 * timelapse into roughly ninety seconds for the same number of billed calls — the cost is
 * identical, only the wall clock changes.
 *
 * Why not simply `Promise.all` everything:
 *
 *  - Browsers cap concurrent connections per origin (6 on HTTP/1.1), so past that point
 *    requests queue in the network stack where nothing can see or cancel them.
 *  - Image APIs rate-limit hard. Twelve simultaneous requests is a good way to turn a
 *    working run into a fistful of 429s.
 *  - Results should appear as they land, and a cancel should stop work that hasn't
 *    started rather than waiting for all of it.
 */

export interface PoolOptions {
  /** How many to keep in flight. */
  concurrency: number;
  /** Called each time one finishes, successfully or not. */
  onSettled?: () => void;
  /** Return true to stop starting new work. Already-running tasks are left to finish. */
  isCancelled?: () => boolean;
  /** Attempts per item when the failure looks retryable. 1 disables retrying. */
  attempts?: number;
  /** Base backoff in ms; doubles per attempt. Injected so tests don't actually wait. */
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface PoolResult<T> {
  index: number;
  value?: T;
  error?: unknown;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Rate limits and transient upstream errors are worth another go; a bad key or a rejected
 * photo will fail identically every time, and retrying just burns the user's quota and
 * patience.
 *
 * **503 is deliberately not retryable here.** This client only ever talks to our own API,
 * and `apps/api/src/openaiErrors.ts` uses 503 specifically for "our configuration is
 * wrong" — a revoked key, or an account with no credit. Neither improves by asking again,
 * and with a dozen images in a run the retries would be three wasted round trips each.
 * Genuine upstream trouble arrives as 502.
 */
export function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (typeof status === 'number') {
    if (status === 429) return true;
    if (status === 503) return false;
    return status >= 500 && status < 600;
  }
  // Network-level failure with no status: worth one more attempt.
  return err instanceof TypeError;
}

/**
 * Process `items` with at most `concurrency` in flight.
 *
 * Resolves once everything has settled, with results in the original order — callers that
 * want them sooner should use `onSettled` plus their own state, which is what the panel
 * does so each frame appears the moment it arrives.
 */
export async function runPool<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  opts: PoolOptions,
): Promise<PoolResult<R>[]> {
  const {
    concurrency,
    onSettled,
    isCancelled,
    attempts = 3,
    baseDelayMs = 1000,
    sleep = defaultSleep,
  } = opts;

  const results: PoolResult<R>[] = [];
  let next = 0;

  const runOne = async (item: T, index: number): Promise<void> => {
    for (let attempt = 1; attempt <= Math.max(1, attempts); attempt++) {
      try {
        results[index] = { index, value: await worker(item, index) };
        return;
      } catch (err) {
        const lastAttempt = attempt >= attempts;
        if (lastAttempt || !isRetryable(err) || isCancelled?.()) {
          results[index] = { index, error: err };
          return;
        }
        // Exponential backoff. A 429 from several parallel requests resolves quickly;
        // hammering it immediately just extends the window.
        await sleep(baseDelayMs * 2 ** (attempt - 1));
      }
    }
  };

  const lane = async (): Promise<void> => {
    for (;;) {
      if (isCancelled?.()) return;
      const index = next++;
      if (index >= items.length) return;
      await runOne(items[index]!, index);
      onSettled?.();
    }
  };

  // One lane per concurrency slot, each pulling from the shared cursor — so a slow item
  // doesn't hold up the queue behind it the way fixed batching would.
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, lane));

  return results.filter(Boolean);
}
