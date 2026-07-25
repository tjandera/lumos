import { describe, it, expect } from 'vitest';
import { safeParseSceneDocument } from './schema';
import { computeCollisions } from './collision';
import { RoomPhotoProposalSchema, materializeRoomPhoto, type RoomPhotoProposal } from './roomPhoto';

function baseProposal(overrides: Partial<RoomPhotoProposal> = {}): RoomPhotoProposal {
  return RoomPhotoProposalSchema.parse({
    roomLabel: 'Living Room',
    roomWidthMeters: 5,
    roomDepthMeters: 4,
    ceilingHeightMeters: 2.7,
    wallMaterial: { colorHex: '#efeae2', finish: 'matte' },
    floorMaterial: { colorHex: '#d9d2c7', finish: 'satin' },
    openings: [{ kind: 'window', wall: 'S', positionAlongWall: 0.4, widthMeters: 1.6, heightMeters: 1.2, sillHeightMeters: 0.9 }],
    furniture: [{ category: 'sofa', nx: 0.5, nz: 0.2, rotationDeg: 0, confidence: 0.8 }],
    fixtures: [{ kind: 'ceiling', nx: 0.5, nz: 0.5, kelvin: 2700, on: true }],
    notes: 'Bright room, window on the south wall.',
    ...overrides,
  });
}

describe('materializeRoomPhoto', () => {
  it('produces a schema-valid SceneDocument', () => {
    const { doc } = materializeRoomPhoto(baseProposal());
    const result = safeParseSceneDocument(doc);
    expect(result.success).toBe(true);
  });

  it('builds a rectangular room matching the requested dimensions', () => {
    const { doc } = materializeRoomPhoto(baseProposal({ roomWidthMeters: 6, roomDepthMeters: 3.5 }));
    const walls = doc.rooms[0].walls;
    const north = walls.find((w) => w.id === 'wall-N')!;
    const west = walls.find((w) => w.id === 'wall-W')!;
    expect(Math.hypot(north.end.x - north.start.x, north.end.z - north.start.z)).toBeCloseTo(6);
    expect(Math.hypot(west.end.x - west.start.x, west.end.z - west.start.z)).toBeCloseTo(3.5);
  });

  it('rejects out-of-range room dimensions at the schema boundary', () => {
    expect(() => baseProposal({ roomWidthMeters: 500 })).toThrow();
    expect(() => baseProposal({ roomDepthMeters: 0.01 })).toThrow();
  });

  it('clamps room dimensions defensively even for a proposal built without going through the schema', () => {
    // The zod bounds above are the normal gate; this exercises materializeRoomPhoto's
    // own re-clamp for a proposal that reaches it some other way (a hand-built object,
    // or a future relaxed schema) — defense in depth, not something that should happen
    // in the real request path.
    const raw: RoomPhotoProposal = { ...baseProposal(), roomWidthMeters: 500, roomDepthMeters: 0.01 };
    const { doc } = materializeRoomPhoto(raw);
    const walls = doc.rooms[0].walls;
    const north = walls.find((w) => w.id === 'wall-N')!;
    const len = Math.hypot(north.end.x - north.start.x, north.end.z - north.start.z);
    expect(len).toBeGreaterThanOrEqual(1.5);
    expect(len).toBeLessThanOrEqual(15);
  });

  it('keeps an opening within its host wall bounds', () => {
    const { doc } = materializeRoomPhoto(
      baseProposal({
        roomWidthMeters: 3,
        openings: [{ kind: 'window', wall: 'N', positionAlongWall: 0.99, widthMeters: 2, heightMeters: 1.2, sillHeightMeters: 0.9 }],
      }),
    );
    const opening = doc.openings[0];
    const wall = doc.rooms[0].walls.find((w) => w.id === opening.wallId)!;
    const wallLen = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
    expect(opening.offset).toBeGreaterThanOrEqual(0);
    expect(opening.offset + opening.width).toBeLessThanOrEqual(wallLen + 1e-6);
  });

  it('maps a known furniture category to the matching catalog id', () => {
    const { doc, skippedFurnitureCategories } = materializeRoomPhoto(
      baseProposal({ furniture: [{ category: 'coffee_table', nx: 0.5, nz: 0.5, rotationDeg: 0, confidence: 0.9 }] }),
    );
    expect(doc.furniture).toHaveLength(1);
    expect(doc.furniture[0].catalogId).toBe('coffee-table');
    expect(skippedFurnitureCategories).toHaveLength(0);
  });

  it('drops unmapped furniture categories and reports them', () => {
    const { doc, skippedFurnitureCategories } = materializeRoomPhoto(
      baseProposal({
        furniture: [
          { category: 'sofa', nx: 0.5, nz: 0.5, rotationDeg: 0, confidence: 0.9 },
          { category: 'other', nx: 0.2, nz: 0.2, rotationDeg: 0, confidence: 0.3 },
        ],
      }),
    );
    expect(doc.furniture).toHaveLength(1);
    expect(skippedFurnitureCategories).toEqual(['other']);
  });

  it('resolves furniture placements the proposal put on top of each other', () => {
    // A 3rd, otherwise-fine item is included deliberately: relaying out only the
    // colliding pair (sofa/armchair) without re-checking against it would be exactly
    // the kind of fix that looks right in isolation but can still land a moved piece
    // on top of an untouched one.
    const { doc } = materializeRoomPhoto(
      baseProposal({
        furniture: [
          { category: 'sofa', nx: 0.5, nz: 0.5, rotationDeg: 0, confidence: 0.9 },
          { category: 'armchair', nx: 0.5, nz: 0.5, rotationDeg: 0, confidence: 0.9 },
          { category: 'rug', nx: 0.9, nz: 0.9, rotationDeg: 0, confidence: 0.6 },
        ],
      }),
    );
    const dimsByCatalogId: Record<string, { width: number; depth: number }> = {
      'sofa-2seat': { width: 1.6, depth: 0.85 },
      armchair: { width: 0.85, depth: 0.85 },
      rug: { width: 2.0, depth: 1.4 },
    };
    const hits = computeCollisions(
      doc.furniture.map((f) => {
        const dims = dimsByCatalogId[f.catalogId];
        return { id: f.id, cx: f.position.x, cz: f.position.z, width: dims.width, depth: dims.depth, rotationDeg: f.rotationY };
      }),
    );
    expect(hits.size).toBe(0);
  });

  it('keeps furniture fully inside the room footprint', () => {
    const { doc } = materializeRoomPhoto(
      baseProposal({ roomWidthMeters: 3, roomDepthMeters: 3, furniture: [{ category: 'bed', nx: 0, nz: 0, rotationDeg: 0, confidence: 0.9 }] }),
    );
    const bed = doc.furniture[0];
    expect(Math.abs(bed.position.x)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(bed.position.z)).toBeLessThanOrEqual(1.5);
  });

  it('places fixtures as lights with the fixed mount height for their kind', () => {
    const { doc } = materializeRoomPhoto(
      baseProposal({ fixtures: [{ kind: 'wall', nx: 0.1, nz: 0.5, kelvin: 3000, on: true }] }),
    );
    expect(doc.lights).toHaveLength(1);
    expect(doc.lights[0].kind).toBe('wall');
    expect(doc.lights[0].position.y).toBe(1.8);
  });

  it('falls back to a sane wall color when the model returns a malformed hex', () => {
    const { doc } = materializeRoomPhoto(baseProposal({ wallMaterial: { colorHex: 'not-a-color', finish: 'shiny' } }));
    expect(doc.rooms[0].materials.wall.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(doc.rooms[0].materials.wall.finish).toBe('matte');
  });

  it('uses a placeholder site the caller is expected to overwrite', () => {
    const { doc } = materializeRoomPhoto(baseProposal());
    expect(doc.site).toEqual({ lat: 0, lng: 0, trueNorthOffsetDeg: 0 });
  });
});
