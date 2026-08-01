import { afterEach, describe, expect, it } from "vitest";
import { createMemoryCounterStore, createPostgresCounterStore, pruneUsageCounters } from "./counterStore.js";
import { createRawTestPgPool } from "../db/testPgPool.js";
import { ensurePgSchema } from "../db/pool.js";
import { createRateLimiter } from "../ai/rateLimit.js";
import { createSpendGuard } from "../spendGuard.js";

/**
 * The point of this file is the multi-replica case. A single process was always fine;
 * what was broken was two of them, each counting to the limit separately.
 */

describe("memory counter store", () => {
  it("counts within a window and starts fresh after it lapses", async () => {
    let now = 1_000_000;
    const store = createMemoryCounterStore(() => now);
    expect((await store.hit("k", 1000)).count).toBe(1);
    expect((await store.hit("k", 1000)).count).toBe(2);
    now += 1001;
    expect((await store.hit("k", 1000)).count).toBe(1);
  });

  it("releases without going negative", async () => {
    const store = createMemoryCounterStore();
    await store.hit("k", 1000);
    await store.release("k");
    await store.release("k");
    expect((await store.peek("k"))?.count).toBe(0);
  });

  it("keeps separate keys separate", async () => {
    const store = createMemoryCounterStore();
    await store.hit("a", 1000);
    await store.hit("a", 1000);
    expect((await store.hit("b", 1000)).count).toBe(1);
  });

  it("evicts expired keys instead of growing forever", async () => {
    // On a public deployment "distinct key" is "distinct IP", so unbounded growth is
    // something a visitor can drive.
    let now = 0;
    const store = createMemoryCounterStore(() => now);
    for (let i = 0; i < 500; i++) await store.hit(`ip-${i}`, 1000);
    now += 120_000; // past the window and past the sweep interval
    await store.hit("trigger-sweep", 1000);
    // Everything from the first batch is gone.
    expect(await store.peek("ip-0")).toBeNull();
    expect(await store.peek("ip-499")).toBeNull();
  });
});

describe("postgres counter store", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  const store = async () => {
    const t = createRawTestPgPool();
    cleanup = t.cleanup;
    await ensurePgSchema(t.pool);
    return { pool: t.pool, store: createPostgresCounterStore(t.pool) };
  };

  it("counts within a window", async () => {
    const { store: s } = await store();
    expect((await s.hit("k", 60_000)).count).toBe(1);
    expect((await s.hit("k", 60_000)).count).toBe(2);
    expect((await s.hit("k", 60_000)).count).toBe(3);
  });

  it("**shares one counter across separate store instances** — the whole point", async () => {
    // Two `createPostgresCounterStore` calls stand in for two replicas: separate
    // processes, separate objects, same database. Before this, each had its own Map and
    // a configured limit of N was really N x replicas.
    const { pool } = await store();
    const replicaA = createPostgresCounterStore(pool);
    const replicaB = createPostgresCounterStore(pool);

    expect((await replicaA.hit("shared", 60_000)).count).toBe(1);
    expect((await replicaB.hit("shared", 60_000)).count).toBe(2);
    expect((await replicaA.hit("shared", 60_000)).count).toBe(3);
  });

  it("a rate limit is enforced across replicas, not per replica", async () => {
    const { pool } = await store();
    const limitA = createRateLimiter(createPostgresCounterStore(pool), "img", { windowMs: 60_000, max: 3 });
    const limitB = createRateLimiter(createPostgresCounterStore(pool), "img", { windowMs: 60_000, max: 3 });

    // Three allowed in total, however they are spread over the two instances.
    expect(await limitA("1.2.3.4")).toBe(true);
    expect(await limitB("1.2.3.4")).toBe(true);
    expect(await limitA("1.2.3.4")).toBe(true);
    expect(await limitB("1.2.3.4")).toBe(false);
    expect(await limitA("1.2.3.4")).toBe(false);
  });

  it("namespaces keep the chat and image budgets apart", async () => {
    const { pool } = await store();
    const s = createPostgresCounterStore(pool);
    const chat = createRateLimiter(s, "ai-chat", { windowMs: 60_000, max: 1 });
    const image = createRateLimiter(s, "image-day", { windowMs: 60_000, max: 1 });
    expect(await chat("ip")).toBe(true);
    // Using the assistant must not consume the same visitor's image allowance.
    expect(await image("ip")).toBe(true);
    expect(await chat("ip")).toBe(false);
  });

  it("a daily spend ceiling is shared across replicas", async () => {
    const { pool } = await store();
    const guardA = createSpendGuard(createPostgresCounterStore(pool), 2);
    const guardB = createSpendGuard(createPostgresCounterStore(pool), 2);

    expect(await guardA.tryConsume()).toBe(true);
    expect(await guardB.tryConsume()).toBe(true);
    // Two replicas, two images total — not two each.
    expect(await guardA.tryConsume()).toBe(false);
    expect(await guardB.tryConsume()).toBe(false);
    expect((await guardA.status()).remaining).toBe(0);
  });

  it("a refund on one replica frees budget on the other", async () => {
    const { pool } = await store();
    const guardA = createSpendGuard(createPostgresCounterStore(pool), 1);
    const guardB = createSpendGuard(createPostgresCounterStore(pool), 1);

    expect(await guardA.tryConsume()).toBe(true);
    expect(await guardB.tryConsume()).toBe(false);
    await guardA.refund(); // the model call never happened
    expect(await guardB.tryConsume()).toBe(true);
  });

  it("a refused request does not inflate the stored count", async () => {
    // Otherwise a flood of refusals pushes `used` far past the cap and `status()` starts
    // reporting nonsense.
    const { pool } = await store();
    const guard = createSpendGuard(createPostgresCounterStore(pool), 1);
    await guard.tryConsume();
    for (let i = 0; i < 5; i++) await guard.tryConsume();
    expect((await guard.status()).used).toBe(1);
  });

  it("release only applies within a live window", async () => {
    const { store: s } = await store();
    await s.hit("k", 1); // window of 1ms — already lapsed by the time we release
    await new Promise((r) => setTimeout(r, 20));
    await s.release("k");
    // Nothing to give back; the next hit starts a clean window at 1.
    expect((await s.hit("k", 60_000)).count).toBe(1);
  });

  it("prunes expired rows", async () => {
    const { pool, store: s } = await store();
    await s.hit("gone", 1);
    await s.hit("alive", 60_000);
    await new Promise((r) => setTimeout(r, 20));
    expect(await pruneUsageCounters(pool)).toBe(1);
    expect((await s.peek("alive"))?.count).toBe(1);
  });
});

describe("failure behaviour", () => {
  const brokenStore = {
    hit: () => Promise.reject(new Error("db down")),
    release: () => Promise.reject(new Error("db down")),
    peek: () => Promise.reject(new Error("db down")),
  };

  it("a rate limiter fails closed when the counter is unreachable", async () => {
    // Readiness already pulls a pod with no database out of rotation, so "the counter is
    // down" must not become "the limits are off".
    const limit = createRateLimiter(brokenStore, "img", { windowMs: 1000, max: 100 });
    expect(await limit("ip")).toBe(false);
  });

  it("the spend guard fails closed too", async () => {
    const guard = createSpendGuard(brokenStore, 100);
    expect(await guard.tryConsume()).toBe(false);
    expect((await guard.status()).remaining).toBe(0);
  });

  it("a failed refund does not throw — losing one refund beats failing the request", async () => {
    const guard = createSpendGuard(brokenStore, 100);
    await expect(guard.refund()).resolves.toBeUndefined();
  });
});
