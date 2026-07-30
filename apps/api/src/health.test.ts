import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { createRawTestPgPool } from "./db/testPgPool.js";

/**
 * Liveness and readiness are deliberately different checks, and an orchestrator
 * treats them very differently: a failing liveness probe restarts the pod, a
 * failing readiness probe only takes it out of the load-balancer rotation. So
 * liveness must never depend on Postgres (restarting won't fix a down database),
 * while readiness must, or k8s will happily route traffic to an instance that
 * fails every design read and write.
 */
describe("health probes", () => {
  let app: FastifyInstance | undefined;
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await app?.close();
    await cleanup?.();
    app = undefined;
    cleanup = undefined;
  });

  it("reports live without any storage backend configured", async () => {
    app = await buildApp({ logger: false, sessionSecret: "test-secret" });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("reports ready on the file-backed store, naming the backend", async () => {
    app = await buildApp({ logger: false, sessionSecret: "test-secret" });
    const res = await app.inject({ method: "GET", url: "/readyz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, storage: "file" });
  });

  it("reports ready when Postgres answers", async () => {
    const testPool = createRawTestPgPool();
    cleanup = testPool.cleanup;
    app = await buildApp({ logger: false, pgPool: testPool.pool, sessionSecret: "test-secret" });

    const res = await app.inject({ method: "GET", url: "/readyz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, storage: "postgres" });
  });

  it("reports 503 — not 200, and not a crash — when Postgres has gone away", async () => {
    const testPool = createRawTestPgPool();
    cleanup = testPool.cleanup;
    app = await buildApp({ logger: false, pgPool: testPool.pool, sessionSecret: "test-secret" });

    // Simulate the database becoming unreachable *after* a successful startup,
    // which is the case readiness exists for. Startup failure is already fatal.
    testPool.pool.query = (() => Promise.reject(new Error("connection terminated"))) as typeof testPool.pool.query;

    const res = await app.inject({ method: "GET", url: "/readyz" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ ok: false, storage: "postgres" });

    // Liveness must stay green: restarting the pod would not bring Postgres back.
    const live = await app.inject({ method: "GET", url: "/health" });
    expect(live.statusCode).toBe(200);
  });
});
