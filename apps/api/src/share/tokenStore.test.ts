import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FileShareTokenStore } from "./tokenStore.js";
import { describeShareTokenStoreContract } from "./tokenStore.contract.js";

describeShareTokenStoreContract("FileShareTokenStore", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "interior-tokenstore-test-"));
  return {
    store: new FileShareTokenStore(dataDir),
    cleanup: () => rm(dataDir, { recursive: true, force: true })
  };
});
