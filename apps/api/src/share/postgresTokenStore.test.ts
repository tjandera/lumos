import { PostgresShareTokenStore } from "./postgresTokenStore.js";
import { describeShareTokenStoreContract } from "./tokenStore.contract.js";
import { createTestPgPool } from "../db/testPgPool.js";

// Runs the same `ShareTokenStore` contract as `tokenStore.test.ts` against a
// `pg-mem` pool - see `postgresStorage.test.ts` for the caveat on pg-mem
// coverage vs. a live Postgres instance.
describeShareTokenStoreContract("PostgresShareTokenStore (pg-mem)", async () => {
  const { pool, cleanup } = await createTestPgPool();
  return {
    store: new PostgresShareTokenStore(pool),
    cleanup
  };
});
