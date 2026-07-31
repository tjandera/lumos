import { describe, expect, it, vi } from 'vitest';
import { isRetryable, runPool } from './pool';

const noSleep = () => Promise.resolve();

/** A worker that records how many were in flight at once. */
function tracking(delayTicks = 1) {
  let inFlight = 0;
  let peak = 0;
  const worker = async (item: number) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    for (let i = 0; i < delayTicks; i++) await Promise.resolve();
    inFlight--;
    return item * 2;
  };
  return { worker, peak: () => peak };
}

describe('runPool', () => {
  it('processes every item and keeps results in input order', async () => {
    const out = await runPool([1, 2, 3, 4, 5], async (n) => n * 10, { concurrency: 2, sleep: noSleep });
    expect(out.map((r) => r.value)).toEqual([10, 20, 30, 40, 50]);
  });

  it('never exceeds the concurrency limit', async () => {
    const t = tracking(3);
    await runPool([...Array(12).keys()], t.worker, { concurrency: 4, sleep: noSleep });
    expect(t.peak()).toBeLessThanOrEqual(4);
  });

  it('actually runs in parallel rather than quietly serialising', async () => {
    const t = tracking(3);
    await runPool([...Array(12).keys()], t.worker, { concurrency: 4, sleep: noSleep });
    // The whole point of the feature: if this is 1, the pool is doing nothing for us.
    expect(t.peak()).toBeGreaterThan(1);
  });

  it('handles fewer items than lanes without hanging', async () => {
    const out = await runPool([7], async (n) => n, { concurrency: 8, sleep: noSleep });
    expect(out.map((r) => r.value)).toEqual([7]);
  });

  it('reports progress once per settled item, failures included', async () => {
    const onSettled = vi.fn();
    await runPool(
      [1, 2, 3],
      async (n) => {
        if (n === 2) throw Object.assign(new Error('nope'), { status: 400 });
        return n;
      },
      { concurrency: 2, onSettled, sleep: noSleep },
    );
    expect(onSettled).toHaveBeenCalledTimes(3);
  });

  it('keeps the successes when one item fails', async () => {
    // A failed hour must not throw away hours that were already paid for.
    const out = await runPool(
      [1, 2, 3, 4],
      async (n) => {
        if (n === 3) throw Object.assign(new Error('boom'), { status: 400 });
        return n;
      },
      { concurrency: 2, sleep: noSleep },
    );
    expect(out.filter((r) => r.value !== undefined).map((r) => r.value)).toEqual([1, 2, 4]);
    expect(out.find((r) => r.index === 2)?.error).toBeInstanceOf(Error);
  });

  describe('retrying', () => {
    it('retries a 429 and succeeds on a later attempt', async () => {
      let calls = 0;
      const out = await runPool(
        [1],
        async () => {
          if (++calls < 3) throw Object.assign(new Error('rate limited'), { status: 429 });
          return 'ok';
        },
        { concurrency: 1, attempts: 3, sleep: noSleep },
      );
      expect(calls).toBe(3);
      expect(out[0]!.value).toBe('ok');
    });

    it('does not retry a bad key — it would fail identically and burn quota', async () => {
      let calls = 0;
      await runPool(
        [1],
        async () => {
          calls++;
          throw Object.assign(new Error('invalid key'), { status: 401 });
        },
        { concurrency: 1, attempts: 4, sleep: noSleep },
      );
      expect(calls).toBe(1);
    });

    it('gives up after the attempt budget and reports the error', async () => {
      let calls = 0;
      const out = await runPool(
        [1],
        async () => {
          calls++;
          throw Object.assign(new Error('still busy'), { status: 429 });
        },
        { concurrency: 1, attempts: 3, sleep: noSleep },
      );
      expect(calls).toBe(3);
      expect(out[0]!.error).toBeInstanceOf(Error);
    });

    it('backs off for longer on each successive attempt', async () => {
      const waits: number[] = [];
      await runPool(
        [1],
        async () => {
          throw Object.assign(new Error('429'), { status: 429 });
        },
        {
          concurrency: 1,
          attempts: 4,
          baseDelayMs: 100,
          sleep: async (ms) => {
            waits.push(ms);
          },
        },
      );
      expect(waits).toEqual([100, 200, 400]);
    });
  });

  describe('cancelling', () => {
    it('stops starting new work once cancelled', async () => {
      let started = 0;
      let cancelled = false;
      await runPool(
        [...Array(20).keys()],
        async () => {
          started++;
          if (started >= 4) cancelled = true;
          return 1;
        },
        { concurrency: 2, isCancelled: () => cancelled, sleep: noSleep },
      );
      // A couple of in-flight items may still land, but it must not run all twenty.
      expect(started).toBeLessThan(20);
      expect(started).toBeGreaterThanOrEqual(4);
    });

    it('returns whatever finished before the cancel', async () => {
      let cancelled = false;
      const out = await runPool(
        [...Array(10).keys()],
        async (n) => {
          if (n >= 2) cancelled = true;
          return n;
        },
        { concurrency: 1, isCancelled: () => cancelled, sleep: noSleep },
      );
      expect(out.length).toBeGreaterThan(0);
      expect(out.length).toBeLessThan(10);
    });
  });
});

describe('isRetryable', () => {
  it('retries rate limits and genuine upstream trouble', () => {
    expect(isRetryable({ status: 429 })).toBe(true);
    expect(isRetryable({ status: 500 })).toBe(true);
    expect(isRetryable({ status: 502 })).toBe(true);
  });

  it('does not retry the failures that will just repeat', () => {
    expect(isRetryable({ status: 401 })).toBe(false);
    expect(isRetryable({ status: 400 })).toBe(false);
    expect(isRetryable({ status: 422 })).toBe(false);
  });

  it('does not retry 503 — our API uses it for a bad key, not for "try later"', () => {
    // openaiErrors.ts maps a revoked key and an out-of-credit account to 503. Retrying
    // either is three wasted round trips per image, twelve times over in a full run.
    expect(isRetryable({ status: 503 })).toBe(false);
  });

  it('retries a bare network failure once', () => {
    expect(isRetryable(new TypeError('Failed to fetch'))).toBe(true);
    expect(isRetryable(new Error('something else'))).toBe(false);
  });
});
