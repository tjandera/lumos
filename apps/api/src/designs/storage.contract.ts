/**
 * Shared `DesignStorage` behavioral contract, run against every
 * implementation (`FileDesignStorage` in `fileStorage.test.ts`,
 * `PostgresDesignStorage` in `postgresStorage.test.ts`) so the two backends
 * can never silently drift in behavior. Not itself a `*.test.ts` file, so
 * vitest won't try to run it directly - it only runs when a `describe`
 * block below is invoked from a real test file.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyDocument, rectWalls, DEFAULT_ROOM_MATERIALS, CURRENT_SCHEMA_VERSION } from "@interior/core";
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
        site: { lat: 40.7128, lng: -74.006, trueNorthOffsetDeg: 33.5 }
      };
      await storage.save(withSite);

      const loaded = await storage.get("sited-1");
      expect(loaded?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
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
            // v6: walls are explicit segments carrying their own thickness/height.
            walls: rectWalls(4, 3, 2.4, 0.1),
            materials: DEFAULT_ROOM_MATERIALS
          }
        ],
        // v6: openings live at the document root, hosted by wall id.
        openings: [
          {
            id: "door-1",
            wallId: "wall-N",
            kind: "door" as const,
            offset: 1,
            width: 0.9,
            height: 2.1,
            sillHeight: 0,
            glassTint: 0.06,
            covering: { type: "none" as const, state: "open" as const }
          }
        ],
        furniture: [
          {
            id: "sofa-1",
            catalogId: "sofa-2seat",
            position: { x: 1.5, y: 0, z: 1.2 },
            rotationY: 45, // v6: DEGREES
            scale: 1,
            dimensions: { w: 1.8, d: 0.9, h: 0.85 }
          }
        ],
        // v6: the sun isn't a fixture — it comes from site + view.timeOfDay. Only real
        // lamps live in `lights`.
        lights: [
          {
            id: "lamp-1",
            kind: "table" as const,
            position: { x: 1.5, y: 0.9, z: 1.2 },
            intensityCandela: 180,
            color: "#ffe6b0",
            kelvin: 2700,
            on: true,
            castShadow: true,
            auto: false
          }
        ]
      };
      await storage.save(populated);

      const loaded = await storage.get("furnished-1");
      expect(loaded).toEqual(populated);
    });
  });
}
