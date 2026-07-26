/**
 * Test-only helper: an in-memory Postgres emulation (`pg-mem`) wired up to
 * look like a real `pg.Pool` to our storage adapters, so
 * `PostgresDesignStorage`/`PostgresOwnershipStore`/`PostgresShareTokenStore`
 * can be exercised without a live Postgres instance (none is available in
 * this sandbox - see the delivering agent's report).
 *
 * `pg-mem`'s home-made SQL parser is a best-effort emulation, not a byte-for-
 * byte match of real Postgres - see the `pg-mem` limitations note in the
 * report for what this coverage does and doesn't prove.
 */
import { newDb } from "pg-mem";
import type { PgPool } from "./pool.js";
import { ensurePgSchema } from "./pool.js";

export interface TestPgPool {
  pool: PgPool;
  cleanup: () => Promise<void>;
}

function buildRawPool(): PgPool {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  // pg-mem needs a couple of real-Postgres functions/types stubbed in that
  // our SQL doesn't rely on directly but `pg`'s startup handshake queries;
  // registering the common ones keeps `pg.Pool` happy end-to-end.
  db.public.registerFunction({
    name: "current_database",
    implementation: () => "interior_test"
  });

  const { Pool } = db.adapters.createPg();
  return new Pool() as unknown as PgPool;
}

/**
 * A fresh pg-mem-backed pool with no schema yet - use this when the code
 * under test (e.g. `buildApp`) is itself responsible for calling
 * `ensurePgSchema`. Known pg-mem limitation (unfixed upstream as of this
 * writing - https://github.com/oguimbal/pg-mem/issues/344): re-running
 * `CREATE TABLE IF NOT EXISTS` a second time against the *same* pg-mem
 * instance throws ("AST parts have not been read"), even though this is
 * valid, idempotent DDL against real Postgres. So each test gets its own
 * fresh pool/db and `ensurePgSchema` is only ever called once per pool.
 */
export function createRawTestPgPool(): TestPgPool {
  const pool = buildRawPool();
  return {
    pool,
    cleanup: async () => {
      await pool.end();
    }
  };
}

/** A fresh pg-mem-backed pool with the app's schema already created. */
export async function createTestPgPool(): Promise<TestPgPool> {
  const pool = buildRawPool();
  await ensurePgSchema(pool);

  return {
    pool,
    cleanup: async () => {
      await pool.end();
    }
  };
}
