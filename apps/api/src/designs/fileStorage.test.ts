import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "@interior/core";
import { FileDesignStorage } from "./fileStorage.js";
import { describeDesignStorageContract } from "./storage.contract.js";

describeDesignStorageContract("FileDesignStorage", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "interior-filestorage-test-"));
  return {
    storage: new FileDesignStorage(dataDir),
    cleanup: () => rm(dataDir, { recursive: true, force: true })
  };
});

// File-storage-specific behavior not covered by the shared contract
// (path-traversal hardening, on-disk layout, atomic writes) stays here.
describe("FileDesignStorage (file-specific)", () => {
  it("saves a design to a single file named after its id, with no leftover temp files", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "interior-filestorage-test-"));
    try {
      const storage = new FileDesignStorage(dataDir);
      const doc = createEmptyDocument("Test", "abc-123");
      await storage.save(doc);

      const files = await readdir(dataDir);
      expect(files).toEqual(["abc-123.json"]);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("get() returns undefined for a path-traversal id instead of throwing", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "interior-filestorage-test-"));
    try {
      const storage = new FileDesignStorage(dataDir);
      const loaded = await storage.get("../../etc/passwd");
      expect(loaded).toBeUndefined();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("delete() returns false for a path-traversal id instead of throwing", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "interior-filestorage-test-"));
    try {
      const storage = new FileDesignStorage(dataDir);
      expect(await storage.delete("../../etc/passwd")).toBe(false);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
