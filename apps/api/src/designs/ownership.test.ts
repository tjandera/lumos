import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FileOwnershipStore } from "./ownership.js";
import { describeOwnershipStoreContract } from "./ownership.contract.js";

describeOwnershipStoreContract("FileOwnershipStore", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "interior-ownership-test-"));
  return {
    store: new FileOwnershipStore(dataDir),
    cleanup: () => rm(dataDir, { recursive: true, force: true })
  };
});
