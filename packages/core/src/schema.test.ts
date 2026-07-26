import { describe, it, expect } from 'vitest';
import { SceneDocumentSchema, parseSceneDocument, CURRENT_SCHEMA_VERSION } from './schema.js';
import { migrateSceneDocument } from './migrations.js';
import { History } from './undo.js';
import { sampleScene } from './sample.js';

describe('SceneDocument schema', () => {
  it('validates the sample scene', () => {
    expect(() => parseSceneDocument(sampleScene)).not.toThrow();
  });

  it('round-trips through JSON without loss', () => {
    const parsed = parseSceneDocument(JSON.parse(JSON.stringify(sampleScene)));
    expect(parsed).toEqual(sampleScene);
  });

  it('rejects a structurally invalid document', () => {
    const bad = { ...sampleScene, rooms: 'nope' };
    expect(SceneDocumentSchema.safeParse(bad).success).toBe(false);
  });
});

describe('migrations', () => {
  it('upgrades a legacy v1 document to the current version', () => {
    const legacyV1 = {
      schemaVersion: 1,
      id: 'old',
      name: 'Old Doc',
      location: { lat: 10, lng: 20 }, // v1 shape: `location`, no north offset
      rooms: [],
      openings: [],
      furniture: [],
      lights: [],
      view: {
        timeOfDay: '2026-01-01T12:00:00',
        camera: { position: { x: 1, y: 1, z: 1 }, target: { x: 0, y: 0, z: 0 } },
      },
    };
    const migrated = migrateSceneDocument(legacyV1);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.site).toEqual({ lat: 10, lng: 20, trueNorthOffsetDeg: 0 });
    expect('location' in migrated).toBe(false);
  });

  it('upgrades a v2 document, defaulting fixtures to a table lamp and adding lightingScenes', () => {
    const legacyV2 = {
      schemaVersion: 2,
      id: 'old2',
      name: 'Old Doc v2',
      site: { lat: 1, lng: 2, trueNorthOffsetDeg: 0 },
      rooms: [],
      openings: [],
      furniture: [],
      lights: [{ id: 'lamp-1', kind: 'lamp', position: { x: 0, y: 1, z: 0 }, intensityCandela: 200, color: '#ffe6b0' }],
      view: {
        timeOfDay: '2026-01-01T12:00:00',
        camera: { position: { x: 1, y: 1, z: 1 }, target: { x: 0, y: 0, z: 0 } },
      },
    };
    const migrated = migrateSceneDocument(legacyV2);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.lightingScenes).toEqual([]);
    expect(migrated.lights[0]).toMatchObject({ kind: 'table', kelvin: 2700, on: true, castShadow: true, auto: false });
    expect(migrated.lights[0].color).toBe('#ffe6b0'); // preserved, not overwritten
  });

  it('upgrades a v3 document, defaulting room materials to match the old hardcoded colours', () => {
    const legacyV3 = {
      schemaVersion: 3,
      id: 'old3',
      name: 'Old Doc v3',
      site: { lat: 1, lng: 2, trueNorthOffsetDeg: 0 },
      rooms: [{ id: 'room-1', name: 'Room', walls: [] }], // no `materials` yet
      openings: [],
      furniture: [],
      lights: [],
      lightingScenes: [],
      view: {
        timeOfDay: '2026-01-01T12:00:00',
        camera: { position: { x: 1, y: 1, z: 1 }, target: { x: 0, y: 0, z: 0 } },
      },
    };
    const migrated = migrateSceneDocument(legacyV3);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.rooms[0].materials).toEqual({
      wall: { color: '#efeae2', finish: 'matte' },
      floor: { color: '#d9d2c7', finish: 'matte' },
      ceiling: { color: '#f5f2ea', finish: 'matte' },
    });
  });

  it('upgrades a v4 document, defaulting window glass tint + an open covering', () => {
    const legacyV4 = {
      schemaVersion: 4,
      id: 'old4',
      name: 'Old Doc v4',
      site: { lat: 1, lng: 2, trueNorthOffsetDeg: 0 },
      rooms: [],
      openings: [
        { id: 'win-1', wallId: 'wall-S', kind: 'window', offset: 0, width: 1, height: 1, sillHeight: 0.9 },
      ],
      furniture: [],
      lights: [],
      lightingScenes: [],
      view: {
        timeOfDay: '2026-01-01T12:00:00',
        camera: { position: { x: 1, y: 1, z: 1 }, target: { x: 0, y: 0, z: 0 } },
      },
    };
    const migrated = migrateSceneDocument(legacyV4);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.openings[0].glassTint).toBe(0.06);
    expect(migrated.openings[0].covering).toEqual({ type: 'none', state: 'open' });
  });

  it('leaves a current document unchanged', () => {
    expect(migrateSceneDocument(sampleScene)).toEqual(sampleScene);
  });

  it('throws on a future schemaVersion', () => {
    expect(() => migrateSceneDocument({ ...sampleScene, schemaVersion: 999 })).toThrow(
      /newer than supported/,
    );
  });
});

describe('History (patch-based undo)', () => {
  it('undoes and redoes edits', () => {
    const h = new History({ count: 0, items: [] as string[] });
    h.update((d) => {
      d.count = 1;
      d.items.push('a');
    });
    h.update((d) => {
      d.count = 2;
      d.items.push('b');
    });
    expect(h.current).toEqual({ count: 2, items: ['a', 'b'] });
    h.undo();
    expect(h.current).toEqual({ count: 1, items: ['a'] });
    h.undo();
    expect(h.current).toEqual({ count: 0, items: [] });
    h.redo();
    expect(h.current).toEqual({ count: 1, items: ['a'] });
  });

  it('ignores no-op updates', () => {
    const h = new History({ count: 0 });
    h.update(() => {});
    expect(h.canUndo()).toBe(false);
  });
});

describe('cross-lineage migration (merged codebases)', () => {
  /** A document as the other (polyline) codebase wrote it: rooms are a closed polyline of
   * {x,y} corners, openings nested by wallIndex, sun as a light source, identity in meta. */
  const polylineDoc = {
    schemaVersion: 2,
    site: { lat: 1.3, lng: 103.8, trueNorthOffsetDeg: 15 },
    meta: { id: 'd-1', name: 'Her Studio', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
    rooms: [
      {
        id: 'r1',
        name: 'Living',
        walls: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 3 },
          { x: 0, y: 3 },
        ],
        wallThickness: 0.15,
        height: 2.8,
        openings: [
          { id: 'o1', type: 'window', wallIndex: 1, position: 1, width: 1.2, height: 1.1, sillHeight: 0.9 },
        ],
      },
    ],
    furniture: [
      { id: 'f1', catalogId: 'sofa-2seat', position: { x: 1, y: 0, z: 1 }, rotationY: 90, dimensions: { w: 1.6, d: 0.85, h: 0.8 } },
    ],
    lights: [
      { type: 'sun', id: 's1', date: '2026-06-21', time: '14:30', latitude: 1.3, longitude: 103.8, northOffset: 0 },
      { type: 'lamp', id: 'l1', furnitureItemId: 'f1', intensity: 200, color: '#ffddaa', on: true },
    ],
  };

  it('converts a polyline-lineage document into a valid current document', () => {
    const doc = migrateSceneDocument(polylineDoc);
    expect(doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(doc.meta.id).toBe('d-1');
    expect(doc.meta.name).toBe('Her Studio');
  });

  it('turns the closed polyline into one wall segment per edge, including the closing edge', () => {
    const doc = migrateSceneDocument(polylineDoc);
    const walls = doc.rooms[0]!.walls;
    expect(walls).toHaveLength(4);
    // Plan plane differs: their {x,y} is our {x,z}.
    expect(walls[0]!.start).toEqual({ x: 0, z: 0 });
    expect(walls[0]!.end).toEqual({ x: 4, z: 0 });
    // The last segment wraps back to the first corner, closing the room.
    expect(walls[3]!.end).toEqual({ x: 0, z: 0 });
    // Room-level thickness/height are pushed down onto every segment.
    expect(walls.every((w) => w.thickness === 0.15 && w.height === 2.8)).toBe(true);
  });

  it('re-hosts nested openings onto the wall id they were indexed against', () => {
    const doc = migrateSceneDocument(polylineDoc);
    expect(doc.openings).toHaveLength(1);
    const opening = doc.openings[0]!;
    expect(opening.wallId).toBe(doc.rooms[0]!.walls[1]!.id);
    expect(opening.kind).toBe('window');
    expect(opening.offset).toBe(1);
    // Fields their schema never had come back as documented defaults, not undefined.
    expect(opening.covering).toEqual({ type: 'none', state: 'open' });
  });

  it('folds their sun light into site + view.timeOfDay instead of keeping it as a fixture', () => {
    const doc = migrateSceneDocument(polylineDoc);
    expect(doc.lights.some((l) => (l as { kind?: string }).kind === 'sun')).toBe(false);
    expect(doc.view.timeOfDay).toBe('2026-06-21T14:30:00');
    expect(doc.site).toEqual({ lat: 1.3, lng: 103.8, trueNorthOffsetDeg: 15 });
  });

  it('keeps lamps as fixtures, positioned at the furniture they belong to', () => {
    const doc = migrateSceneDocument(polylineDoc);
    expect(doc.lights).toHaveLength(1);
    const lamp = doc.lights[0]!;
    expect(lamp.furnitureItemId).toBe('f1');
    // f1 sits at x:1,z:1 — the lamp should follow it, not sit at the origin.
    expect(lamp.position.x).toBe(1);
    expect(lamp.position.z).toBe(1);
    expect(lamp.intensityCandela).toBe(200);
  });

  it('preserves a per-item dimension override through the conversion', () => {
    const doc = migrateSceneDocument(polylineDoc);
    expect(doc.furniture[0]!.dimensions).toEqual({ w: 1.6, d: 0.85, h: 0.8 });
  });

  it('rejects a polyline document written by a newer version of that app', () => {
    expect(() => migrateSceneDocument({ ...polylineDoc, schemaVersion: 99 })).toThrow(/newer than supported/);
  });

  it('still migrates this lineage’s own documents (shape detection does not misfire)', () => {
    const mine = migrateSceneDocument({ ...sampleScene, schemaVersion: CURRENT_SCHEMA_VERSION });
    expect(mine.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(mine.rooms[0]!.walls[0]!.start).toBeDefined();
  });
});
