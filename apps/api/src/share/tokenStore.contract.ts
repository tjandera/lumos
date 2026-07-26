/**
 * Shared `ShareTokenStore` behavioral contract - see
 * `designs/storage.contract.ts` for the pattern. Run against
 * `FileShareTokenStore` (`tokenStore.test.ts`) and `PostgresShareTokenStore`
 * (`postgresTokenStore.test.ts`).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ShareTokenStore } from "./tokenStore.js";

export interface ShareTokenStoreHarness {
  store: ShareTokenStore;
  cleanup: () => Promise<void>;
}

export function describeShareTokenStoreContract(label: string, setup: () => Promise<ShareTokenStoreHarness>): void {
  describe(`ShareTokenStore contract: ${label}`, () => {
    let store: ShareTokenStore;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const harness = await setup();
      store = harness.store;
      cleanup = harness.cleanup;
    });

    afterEach(async () => {
      await cleanup();
    });

    it("resolve() returns undefined for a token that was never issued", async () => {
      expect(await store.resolve("never-issued")).toBeUndefined();
    });

    it("createToken() then resolve() round-trips the design id", async () => {
      const token = await store.createToken("design-1");
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(20);
      expect(await store.resolve(token)).toBe("design-1");
    });

    it("createToken() issues unguessable-looking distinct tokens per call", async () => {
      const a = await store.createToken("design-1");
      const b = await store.createToken("design-2");
      expect(a).not.toBe(b);
    });

    it("creating a new token for the same design revokes the previous one", async () => {
      const first = await store.createToken("design-1");
      const second = await store.createToken("design-1");

      expect(second).not.toBe(first);
      expect(await store.resolve(first)).toBeUndefined();
      expect(await store.resolve(second)).toBe("design-1");
    });

    it("revokeForDesign() invalidates the active token", async () => {
      const token = await store.createToken("design-1");
      await store.revokeForDesign("design-1");
      expect(await store.resolve(token)).toBeUndefined();
    });

    it("revokeForDesign() is a no-op for a design with no active token", async () => {
      await expect(store.revokeForDesign("never-shared")).resolves.toBeUndefined();
    });

    it("tokens for different designs are independent", async () => {
      const tokenA = await store.createToken("design-a");
      const tokenB = await store.createToken("design-b");

      await store.revokeForDesign("design-a");

      expect(await store.resolve(tokenA)).toBeUndefined();
      expect(await store.resolve(tokenB)).toBe("design-b");
    });
  });
}
