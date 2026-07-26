import { PostgresOwnershipStore } from "./postgresOwnershipStore.js";
import { describeOwnershipStoreContract } from "./ownership.contract.js";
import { createTestPgPool } from "../db/testPgPool.js";

// Runs the same `OwnershipStore` contract as `ownership.test.ts` against a
// `pg-mem` pool - see `postgresStorage.test.ts` for the caveat on pg-mem
// coverage vs. a live Postgres instance.
describeOwnershipStoreContract("PostgresOwnershipStore (pg-mem)", async () => {
  const { pool, cleanup } = await createTestPgPool();
  return {
    store: new PostgresOwnershipStore(pool),
    cleanup
  };
});
