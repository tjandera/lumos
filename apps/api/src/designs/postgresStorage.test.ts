import { PostgresDesignStorage } from "./postgresStorage.js";
import { describeDesignStorageContract } from "./storage.contract.js";
import { createTestPgPool } from "../db/testPgPool.js";

// Runs the same `DesignStorage` contract as `fileStorage.test.ts` against a
// `pg-mem` (in-memory Postgres emulation) pool - no live Postgres available
// in this sandbox; see the delivering agent's report for what is/isn't
// runtime-verified against real Postgres.
describeDesignStorageContract("PostgresDesignStorage (pg-mem)", async () => {
  const { pool, cleanup } = await createTestPgPool();
  return {
    storage: new PostgresDesignStorage(pool),
    cleanup
  };
});
