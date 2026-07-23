import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "./document.js";
import { DEFAULT_SITE, MigrationError, migrate } from "./migrate.js";
import { sceneDocumentSchema } from "./schema.js";

/**
 * A fixture matching the shape the app *actually* saved before this retrofit:
 * no `schemaVersion`, no `site`, and coarse location living on the sun light
 * config (northOffset in radians). Built by hand rather than via a helper so it
 * cannot silently drift to the new shape.
 */
function v1Fixture(): Record<string, unknown> {
  return {
    meta: {
      id: "legacy-1",
      name: "Legacy Flat",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-02T00:00:00.000Z"
    },
    rooms: [
      {
        id: "r1",
        name: "Living",
        walls: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 3 },
          { x: 0, y: 3 }
        ],
        wallThickness: 0.15,
        height: 2.5,
        openings: [{ id: "o1", type: "window", wallIndex: 0, position: 1, width: 1.2, height: 1.1, sillHeight: 0.9 }]
      }
    ],
    furniture: [
      { id: "f1", catalogId: "sofa", position: { x: 1, y: 0, z: 1 }, rotationY: 0, dimensions: { w: 2, d: 1, h: 0.8 } }
    ],
    lights: [
      {
        type: "sun",
        id: "sun",
        date: "2024-06-21",
        time: "15:00",
        latitude: 40.7128,
        longitude: -74.006,
        northOffset: Math.PI / 2
      },
      { type: "lamp", id: "lamp-1", furnitureItemId: "f1", intensity: 12, color: "#ffd9a0", on: true }
    ]
  };
}

describe("migrate v1 -> v2", () => {
  it("upgrades a real v1 document to v2 and passes the schema", () => {
    const migrated = migrate(v1Fixture());

    expect(migrated.schemaVersion).toBe(2);
    // site is derived from the sun light config; northOffset (rad) -> deg.
    expect(migrated.site?.lat).toBe(40.7128);
    expect(migrated.site?.lng).toBe(-74.006);
    expect(migrated.site?.trueNorthOffsetDeg).toBeCloseTo(90, 6);

    // Round-trips through the schema (migrate already validated, assert again).
    expect(() => sceneDocumentSchema.parse(migrated)).not.toThrow();

    // Existing content is preserved untouched.
    expect(migrated.rooms).toHaveLength(1);
    expect(migrated.furniture).toHaveLength(1);
    // Sun config fields remain the renderer's source of truth.
    const sun = migrated.lights.find((l) => l.type === "sun");
    expect(sun).toMatchObject({ latitude: 40.7128, longitude: -74.006, northOffset: Math.PI / 2 });
  });

  it("falls back to the default site when there is no sun light", () => {
    const doc = v1Fixture();
    doc.lights = [];
    const migrated = migrate(doc);
    expect(migrated.site).toEqual(DEFAULT_SITE);
  });
});

describe("migrate v2 passthrough", () => {
  it("returns a v2 document unchanged", () => {
    const doc = createEmptyDocument("Fresh", "fresh-1");
    const migrated = migrate(doc);
    expect(migrated).toEqual(doc);
  });
});

describe("migrate error handling", () => {
  it.each([[null], [undefined], [42], ["a string"], [[]]])("throws MigrationError on garbage input %p", (input) => {
    expect(() => migrate(input)).toThrow(MigrationError);
  });

  it("throws MigrationError with details when the migrated doc fails validation", () => {
    // A v1-shaped object missing required content: migrates structurally but
    // fails schema validation (no meta, rooms not an array).
    let err: unknown;
    try {
      migrate({ rooms: "not-an-array" });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(MigrationError);
    expect((err as MigrationError).details).toBeDefined();
  });

  it("rejects a document whose schema version is newer than supported", () => {
    const future = { ...createEmptyDocument("Future", "f"), schemaVersion: 99 };
    expect(() => migrate(future)).toThrow(/newer than supported/);
  });
});
