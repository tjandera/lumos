/**
 * Shared `DesignStorage` behavioral contract, run against every
 * implementation (`FileDesignStorage` in `fileStorage.test.ts`,
 * `PostgresDesignStorage` in `postgresStorage.test.ts`) so the two backends
 * can never silently drift in behavior. Not itself a `*.test.ts` file, so
 * vitest won't try to run it directly - it only runs when a `describe`
 * block below is invoked from a real test file.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "@interior/core";
import type { DesignStorage } from "./storage.js";

export interface DesignStorageHarness {
  storage: DesignStorage;
  cleanup: () => Promise<void>;
}

export function describeDesignStorageContract(label: string, setup: () => Promise<DesignStorageHarness>): void {
  describe(`DesignStorage contract: ${label}`, () => {
    let storage: DesignStorage;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const harness = await setup();
      storage = harness.storage;
      cleanup = harness.cleanup;
    });

    afterEach(async () => {
      await cleanup();
    });

    it("round-trips a saved design via get()", async () => {
      const doc = createEmptyDocument("Test", "abc-123");
      await storage.save(doc);

      const loaded = await storage.get("abc-123");
      expect(loaded).toEqual(doc);
    });

    it("get() returns undefined for a missing id", async () => {
      const loaded = await storage.get("missing");
      expect(loaded).toBeUndefined();
    });

    it("save() overwrites an existing design with the same id", async () => {
      const doc = createEmptyDocument("Original", "abc-123");
      await storage.save(doc);

      const renamed = { ...doc, meta: { ...doc.meta, name: "Renamed" } };
      await storage.save(renamed);

      const loaded = await storage.get("abc-123");
      expect(loaded?.meta.name).toBe("Renamed");
    });

    it("list() returns summaries sorted by most recently updated", async () => {
      await storage.save(createEmptyDocument("First", "id-1"));
      await new Promise((resolve) => setTimeout(resolve, 5));
      await storage.save(createEmptyDocument("Second", "id-2"));

      const list = await storage.list();
      expect(list.map((d) => d.id)).toEqual(["id-2", "id-1"]);
    });

    it("list() summaries carry id/name/updatedAt", async () => {
      await storage.save(createEmptyDocument("Only", "id-1"));

      const list = await storage.list();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: "id-1", name: "Only" });
      expect(typeof list[0]!.updatedAt).toBe("string");
    });

    it("delete() removes the design and returns true", async () => {
      await storage.save(createEmptyDocument("Test", "abc-123"));

      const deleted = await storage.delete("abc-123");
      expect(deleted).toBe(true);
      expect(await storage.get("abc-123")).toBeUndefined();
    });

    it("delete() returns false for a missing id", async () => {
      expect(await storage.delete("missing")).toBe(false);
    });

    it("preserves schemaVersion and site (jsonb round-trip fidelity)", async () => {
      const doc = createEmptyDocument("Sited", "sited-1");
      const withSite = {
        ...doc,
        schemaVersion: 2,
        site: { lat: 40.7128, lng: -74.006, trueNorthOffsetDeg: 33.5 }
      };
      await storage.save(withSite);

      const loaded = await storage.get("sited-1");
      expect(loaded?.schemaVersion).toBe(2);
      expect(loaded?.site).toEqual({ lat: 40.7128, lng: -74.006, trueNorthOffsetDeg: 33.5 });
    });

    it("preserves nested rooms/furniture/lights structure through save/get", async () => {
      const doc = createEmptyDocument("Furnished", "furnished-1");
      const populated = {
        ...doc,
        rooms: [
          {
            id: "room-1",
            name: "Living Room",
            walls: [
              { x: 0, y: 0 },
              { x: 4, y: 0 },
              { x: 4, y: 3 },
              { x: 0, y: 3 }
            ],
            wallThickness: 0.1,
            height: 2.4,
            openings: [{ id: "door-1", type: "door" as const, wallIndex: 0, position: 1, width: 0.9, height: 2.1, sillHeight: 0 }]
          }
        ],
        furniture: [
          {
            id: "sofa-1",
            catalogId: "sofa-basic",
            position: { x: 1.5, y: 0, z: 1.2 },
            rotationY: Math.PI / 4,
            dimensions: { w: 1.8, d: 0.9, h: 0.85 }
          }
        ],
        lights: [
          { type: "sun" as const, id: "sun", date: "2024-06-21", time: "15:00", latitude: 51.5, longitude: -0.12, northOffset: 0 }
        ]
      };
      await storage.save(populated);

      const loaded = await storage.get("furnished-1");
      expect(loaded).toEqual(populated);
    });
  });
}
