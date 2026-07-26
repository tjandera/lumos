/**
 * Shared `OwnershipStore` behavioral contract - see `storage.contract.ts`
 * for the pattern. Run against `FileOwnershipStore` (`ownership.test.ts`)
 * and `PostgresOwnershipStore` (`postgresOwnershipStore.test.ts`).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OwnershipStore } from "./ownership.js";

export interface OwnershipStoreHarness {
  store: OwnershipStore;
  cleanup: () => Promise<void>;
}

export function describeOwnershipStoreContract(label: string, setup: () => Promise<OwnershipStoreHarness>): void {
  describe(`OwnershipStore contract: ${label}`, () => {
    let store: OwnershipStore;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const harness = await setup();
      store = harness.store;
      cleanup = harness.cleanup;
    });

    afterEach(async () => {
      await cleanup();
    });

    it("getOwner() returns undefined for a design that was never claimed", async () => {
      expect(await store.getOwner("never-claimed")).toBeUndefined();
    });

    it("setOwner() then getOwner() round-trips the owner id", async () => {
      await store.setOwner("design-1", "user-a");
      expect(await store.getOwner("design-1")).toBe("user-a");
    });

    it("setOwner() overwrites a previous owner for the same design", async () => {
      await store.setOwner("design-1", "user-a");
      await store.setOwner("design-1", "user-b");
      expect(await store.getOwner("design-1")).toBe("user-b");
    });

    it("owners of different designs are independent (matrix)", async () => {
      await store.setOwner("design-1", "user-a");
      await store.setOwner("design-2", "user-b");
      await store.setOwner("design-3", "user-a");

      expect(await store.getOwner("design-1")).toBe("user-a");
      expect(await store.getOwner("design-2")).toBe("user-b");
      expect(await store.getOwner("design-3")).toBe("user-a");
    });

    it("deleteOwner() removes the entry", async () => {
      await store.setOwner("design-1", "user-a");
      await store.deleteOwner("design-1");
      expect(await store.getOwner("design-1")).toBeUndefined();
    });

    it("deleteOwner() is a no-op for a design with no owner", async () => {
      await expect(store.deleteOwner("never-claimed")).resolves.toBeUndefined();
    });
  });
}
