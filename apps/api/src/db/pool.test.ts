import { describe, expect, it } from "vitest";
import { ensurePgSchema, pingPgPool, type PgPool } from "./pool.js";
import { createRawTestPgPool, createTestPgPool } from "./testPgPool.js";

describe("pool", () => {
  it("ensurePgSchema creates the designs/owners/shares tables (CREATE TABLE IF NOT EXISTS)", async () => {
    const { pool, cleanup } = createRawTestPgPool();
    try {
      await expect(ensurePgSchema(pool)).resolves.toBeUndefined();
      const tables = await pool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
      );
      expect(tables.rows.map((r) => r.table_name)).toEqual(["designs", "owners", "shares"]);
    } finally {
      await cleanup();
    }
  });

  // NOTE: real-world idempotency (calling `ensurePgSchema` again on a later
  // app restart against the same live database) is NOT re-verified here
  // beyond code review - pg-mem has an open bug where re-running `CREATE
  // TABLE IF NOT EXISTS` a second time against the *same* in-memory instance
  // throws ("AST parts have not been read"), even though the statement is
  // valid/idempotent DDL against real Postgres:
  // https://github.com/oguimbal/pg-mem/issues/344
  // `ensurePgSchema`'s `CREATE TABLE IF NOT EXISTS` is standard idempotent
  // DDL - this is a pg-mem emulation gap, not something the adapter can work
  // around without deviating from plain SQL. Flagging as not
  // runtime-verified against real Postgres; see the delivering agent's
  // report.

  it("pingPgPool resolves against a reachable database", async () => {
    const { pool, cleanup } = await createTestPgPool();
    try {
      await expect(pingPgPool(pool)).resolves.toBeUndefined();
    } finally {
      await cleanup();
    }
  });

  it("pingPgPool throws a clear, actionable error when the database is unreachable", async () => {
    const unreachable: PgPool = {
      query: () => Promise.reject(new Error("connect ECONNREFUSED 127.0.0.1:5432"))
    } as unknown as PgPool;

    await expect(pingPgPool(unreachable)).rejects.toThrow(/Could not connect to Postgres/);
    await expect(pingPgPool(unreachable)).rejects.toThrow(/ECONNREFUSED/);
  });
});
