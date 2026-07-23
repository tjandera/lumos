import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { createRawTestPgPool, createTestPgPool } from "./db/testPgPool.js";
import { pingPgPool, type PgPool } from "./db/pool.js";

// End-to-end coverage of the DATABASE_URL-driven storage selection: an
// injected pg-mem pool (via `pgPool`) should make the app persist through
// Postgres end-to-end - designs, ownership, and share tokens - exactly like
// the file-backed default does in `designs/routes.test.ts` /
// `share/routes.test.ts`. No live Postgres in this sandbox; see the
// delivering agent's report.
describe("buildApp with Postgres storage", () => {
  let app: FastifyInstance | undefined;
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await app?.close();
    await cleanup?.();
    app = undefined;
    cleanup = undefined;
  });

  it("persists a created design in the injected Postgres pool", async () => {
    // Raw (schema-less) pool: `buildApp` itself is responsible for calling
    // `ensurePgSchema` - see `db/testPgPool.ts` for why we don't pre-create
    // the schema here (a pg-mem limitation around repeated `CREATE TABLE IF
    // NOT EXISTS` on the same instance).
    const testPool = createRawTestPgPool();
    cleanup = testPool.cleanup;

    app = await buildApp({ logger: false, pgPool: testPool.pool, sessionSecret: "test-secret" });

    const createRes = await app.inject({ method: "POST", url: "/designs", payload: { name: "Postgres Flat" } });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json();

    const { rows } = await testPool.pool.query("SELECT id, name FROM designs WHERE id = $1", [created.meta.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: created.meta.id, name: "Postgres Flat" });
  });

  it("full CRUD + share round-trip works against the Postgres backend", async () => {
    const testPool = createRawTestPgPool();
    cleanup = testPool.cleanup;

    app = await buildApp({ logger: false, pgPool: testPool.pool, sessionSecret: "test-secret" });

    const createRes = await app.inject({ method: "POST", url: "/designs", payload: { name: "Round Trip" } });
    const created = createRes.json();
    const cookie = (createRes.headers["set-cookie"] as string | string[] | undefined);
    const cookieHeader = Array.isArray(cookie) ? cookie[0]!.split(";")[0] : cookie?.split(";")[0];

    const getRes = await app.inject({
      method: "GET",
      url: `/designs/${created.meta.id}`,
      headers: cookieHeader ? { cookie: cookieHeader } : {}
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json()).toEqual(created);

    const shareRes = await app.inject({
      method: "POST",
      url: `/designs/${created.meta.id}/share`,
      headers: cookieHeader ? { cookie: cookieHeader } : {}
    });
    expect(shareRes.statusCode).toBe(201);
    const { token } = shareRes.json();

    const publicRes = await app.inject({ method: "GET", url: `/share/${token}` });
    expect(publicRes.statusCode).toBe(200);

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/designs/${created.meta.id}`,
      headers: cookieHeader ? { cookie: cookieHeader } : {}
    });
    expect(deleteRes.statusCode).toBe(204);

    const afterDelete = await app.inject({ method: "GET", url: `/share/${token}` });
    expect(afterDelete.statusCode).toBe(404);
  });

  it("buildApp rejects with a clear error when Postgres is unreachable at startup", async () => {
    const unreachablePool = {
      query: () => Promise.reject(new Error("connect ECONNREFUSED 127.0.0.1:5432"))
    } as unknown as PgPool;

    await expect(buildApp({ logger: false, pgPool: unreachablePool, sessionSecret: "test-secret" })).rejects.toThrow(
      /Could not connect to Postgres/
    );
  });

  it("pingPgPool sanity check against the same pg-mem pool used above", async () => {
    const testPool = await createTestPgPool();
    try {
      await expect(pingPgPool(testPool.pool)).resolves.toBeUndefined();
    } finally {
      await testPool.cleanup();
    }
  });
});
