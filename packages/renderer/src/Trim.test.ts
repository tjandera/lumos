import { describe, expect, it } from 'vitest';
import { buildTrimPieces } from './Trim.js';
import { rectWalls, DEFAULT_ROOM_MATERIALS, createEmptyDocument } from '@interior/core';
import type { Opening, SceneDocument } from '@interior/core';

const CENTROID = { x: 0, z: 0 };

/** 5x4m room centred on the origin, so the centroid is (0,0). */
function docWith(openings: Opening[] = []): SceneDocument {
  const doc = createEmptyDocument();
  doc.rooms = [
    { id: 'r', name: 'R', walls: rectWalls(5, 4, 2.5, 0.1), materials: DEFAULT_ROOM_MATERIALS },
  ];
  doc.openings = openings;
  return doc;
}

function opening(over: Partial<Opening> & { wallId: string; kind: 'window' | 'door' }): Opening {
  return {
    id: 'o',
    offset: 1,
    width: 1,
    height: 1.2,
    sillHeight: 0.9,
    glassTint: 0.06,
    covering: { type: 'none', state: 'open' },
    ...over,
  } as Opening;
}

const kinds = (ps: ReturnType<typeof buildTrimPieces>) => ps.map((p) => p.kind);

describe('buildTrimPieces', () => {
  it('skirts every wall of a bare room', () => {
    const pieces = buildTrimPieces(docWith(), CENTROID);
    expect(pieces).toHaveLength(4);
    expect(new Set(kinds(pieces))).toEqual(new Set(['skirting']));
  });

  it('runs skirting the full length of an unbroken wall', () => {
    const wall = docWith().rooms[0]!.walls[0]!;
    const piece = buildTrimPieces(docWith(), CENTROID).find((p) => p.key.includes(wall.id))!;
    // wall-N spans the 5m width.
    expect(piece.size[0]).toBeCloseTo(5, 5);
  });

  it('sits skirting on the floor, not floating or sunk', () => {
    const p = buildTrimPieces(docWith(), CENTROID)[0]!;
    // Box is centred, so its centre should be half its height above the floor.
    expect(p.position[1]).toBeCloseTo(p.size[1] / 2, 6);
  });

  it('breaks skirting around a door, which meets the floor', () => {
    const walls = docWith().rooms[0]!.walls;
    const doc = docWith([opening({ id: 'd', wallId: walls[0]!.id, kind: 'door', offset: 1, width: 0.9, sillHeight: 0, height: 2.1 })]);
    const onWall = buildTrimPieces(doc, CENTROID).filter((p) => p.kind === 'skirting' && p.key.includes(walls[0]!.id));
    // Two runs: before the door and after it.
    expect(onWall).toHaveLength(2);
    const total = onWall.reduce((s, p) => s + p.size[0], 0);
    expect(total).toBeCloseTo(5 - 0.9, 5);
  });

  it('does not break skirting for a window, which sits above it', () => {
    const walls = docWith().rooms[0]!.walls;
    const doc = docWith([opening({ id: 'w', wallId: walls[0]!.id, kind: 'window' })]);
    const onWall = doc.openings && buildTrimPieces(doc, CENTROID)
      .filter((p) => p.kind === 'skirting' && p.key.includes(walls[0]!.id));
    expect(onWall).toHaveLength(1);
    expect(onWall![0]!.size[0]).toBeCloseTo(5, 5);
  });

  it('gives each window a sill at its opening height', () => {
    const walls = docWith().rooms[0]!.walls;
    const doc = docWith([opening({ id: 'w', wallId: walls[0]!.id, kind: 'window', sillHeight: 0.95 })]);
    const sill = buildTrimPieces(doc, CENTROID).find((p) => p.kind === 'sill')!;
    expect(sill).toBeTruthy();
    // Sits just on top of the opening's sill height.
    expect(sill.position[1]).toBeGreaterThanOrEqual(0.95);
    expect(sill.position[1]).toBeLessThan(0.95 + 0.05);
    // Slightly wider than the hole so it reads as a ledge, not a plug.
    expect(sill.size[0]).toBeGreaterThan(1);
  });

  it('frames a door with two jambs and a head', () => {
    const walls = docWith().rooms[0]!.walls;
    const doc = docWith([opening({ id: 'd', wallId: walls[0]!.id, kind: 'door', sillHeight: 0, height: 2.1, width: 0.9 })]);
    const arch = buildTrimPieces(doc, CENTROID).filter((p) => p.kind === 'architrave');
    expect(arch).toHaveLength(3);
    const head = arch.find((p) => p.key.endsWith(':head'))!;
    expect(head.size[0]).toBeGreaterThan(0.9); // spans wider than the opening
    expect(head.position[1]).toBeGreaterThan(2.1); // sits above the head height
  });

  it('puts trim on the room-interior side of the wall', () => {
    // Every piece should be nearer the centroid than the wall centreline it belongs to.
    const doc = docWith();
    for (const p of buildTrimPieces(doc, CENTROID)) {
      const distFromCentre = Math.hypot(p.position[0] - CENTROID.x, p.position[2] - CENTROID.z);
      // Half-width of the 5x4 room is 2.5 / 2.0; interior trim must be inside that.
      expect(distFromCentre).toBeLessThan(2.55);
    }
  });

  it('ignores openings belonging to another wall', () => {
    const doc = docWith([opening({ id: 'x', wallId: 'not-a-wall', kind: 'door', sillHeight: 0, height: 2 })]);
    const pieces = buildTrimPieces(doc, CENTROID);
    expect(pieces.filter((p) => p.kind === 'architrave')).toHaveLength(0);
    expect(pieces.filter((p) => p.kind === 'skirting')).toHaveLength(4);
  });

  it('returns nothing for a document with no rooms', () => {
    const doc = createEmptyDocument();
    doc.rooms = [];
    expect(buildTrimPieces(doc, CENTROID)).toEqual([]);
  });

  it('skips a degenerate zero-length wall instead of emitting a broken piece', () => {
    const doc = docWith();
    doc.rooms[0]!.walls = [
      { id: 'z', start: { x: 1, z: 1 }, end: { x: 1, z: 1 }, thickness: 0.1, height: 2.5 },
    ];
    expect(buildTrimPieces(doc, CENTROID)).toEqual([]);
  });

  it('produces unique keys, so React never sees duplicates', () => {
    const walls = docWith().rooms[0]!.walls;
    const doc = docWith([
      opening({ id: 'd1', wallId: walls[0]!.id, kind: 'door', offset: 0.5, width: 0.9, sillHeight: 0, height: 2.1 }),
      opening({ id: 'd2', wallId: walls[0]!.id, kind: 'door', offset: 3.0, width: 0.9, sillHeight: 0, height: 2.1 }),
      opening({ id: 'w1', wallId: walls[1]!.id, kind: 'window' }),
    ]);
    const keys = buildTrimPieces(doc, CENTROID).map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
