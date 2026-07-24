import { describe, it, expect } from 'vitest';
import { SceneDocumentSchema, parseSceneDocument, CURRENT_SCHEMA_VERSION } from './schema';
import { migrateSceneDocument } from './migrations';
import { History } from './undo';
import { sampleScene } from './sample';

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
