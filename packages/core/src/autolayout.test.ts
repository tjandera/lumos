import { describe, it, expect } from 'vitest';
import { suggestLayout } from './autolayout.js';
import { computeCollisions } from './collision.js';

const room = { minX: -2.5, maxX: 2.5, minZ: -2, maxZ: 2 };

describe('suggestLayout', () => {
  it('places every item, and none overlap', () => {
    const items = [
      { id: 'a', width: 0.85, depth: 0.85 },
      { id: 'b', width: 1.6, depth: 0.85 },
      { id: 'c', width: 1.1, depth: 0.6 },
    ];
    const placed = suggestLayout(room, items);
    expect(placed).toHaveLength(3);

    const byId = Object.fromEntries(items.map((it) => [it.id, it]));
    const hits = computeCollisions(
      placed.map((p) => {
        const it = byId[p.id]!;
        return {
          id: p.id,
          cx: p.x,
          cz: p.z,
          width: it.width,
          depth: it.depth,
          rotationDeg: p.rotationY,
        };
      }),
    );
    expect(hits.size).toBe(0);
  });

  it('keeps item centers inside the room', () => {
    const [p] = suggestLayout(room, [{ id: 'a', width: 1.0, depth: 0.6 }]);
    expect(p!.x).toBeGreaterThanOrEqual(room.minX);
    expect(p!.x).toBeLessThanOrEqual(room.maxX);
    expect(p!.z).toBeGreaterThanOrEqual(room.minZ);
    expect(p!.z).toBeLessThanOrEqual(room.maxZ);
  });

  it('arranges mixed furniture types without stacking at the center', () => {
    const items = [
      { id: 'sofa', width: 2.0, depth: 0.9, category: 'seating', catalogId: 'sofa-3seat' },
      { id: 'coffee', width: 1.1, depth: 0.6, category: 'tables', catalogId: 'coffee-table' },
      { id: 'chair', width: 0.85, depth: 0.85, category: 'seating', catalogId: 'armchair' },
      { id: 'lamp', width: 0.4, depth: 0.4, category: 'lighting', catalogId: 'floor-lamp' },
      { id: 'shelf', width: 0.9, depth: 0.35, category: 'storage', catalogId: 'bookshelf' },
      { id: 'rug', width: 2.0, depth: 1.4, category: 'decor', catalogId: 'rug' },
      { id: 'plant', width: 0.5, depth: 0.5, category: 'decor', catalogId: 'plant' },
    ];
    const placed = suggestLayout(room, items);
    expect(placed).toHaveLength(items.length);

    const byId = Object.fromEntries(placed.map((p) => [p.id, p]));
    const centerX = (room.minX + room.maxX) / 2;
    const centerZ = (room.minZ + room.maxZ) / 2;

    // Rug near room center; sofa against a wall (not at center).
    expect(Math.hypot(byId.rug!.x - centerX, byId.rug!.z - centerZ)).toBeLessThan(0.6);
    expect(Math.hypot(byId.sofa!.x - centerX, byId.sofa!.z - centerZ)).toBeGreaterThan(0.8);

    // Coffee table near the sofa, not on top of it.
    const coffeeDist = Math.hypot(byId.coffee!.x - byId.sofa!.x, byId.coffee!.z - byId.sofa!.z);
    expect(coffeeDist).toBeGreaterThan(0.7);
    expect(coffeeDist).toBeLessThan(2.2);

    // Non-rug pieces must not collide with each other (rugs may underlie seating).
    const solid = items.filter((i) => i.id !== 'rug');
    const hits = computeCollisions(
      solid.map((item) => {
        const p = byId[item.id]!;
        return {
          id: item.id,
          cx: p.x,
          cz: p.z,
          width: item.width,
          depth: item.depth,
          rotationDeg: p.rotationY,
        };
      }),
    );
    expect(hits.size).toBe(0);

    // Distinct positions — the old algorithm dumped overflow all at the center.
    const keys = new Set(placed.map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`));
    expect(keys.size).toBeGreaterThanOrEqual(placed.length - 1);
  });

  it('keeps a crowded mixed set free of solid overlaps', () => {
    const items = [
      { id: 'sofa', width: 2.0, depth: 0.9, category: 'seating', catalogId: 'sofa-3seat' },
      { id: 'sofa2', width: 1.6, depth: 0.85, category: 'seating', catalogId: 'sofa-2seat' },
      { id: 'coffee', width: 1.1, depth: 0.6, category: 'tables', catalogId: 'coffee-table' },
      { id: 'dining', width: 1.6, depth: 0.9, category: 'tables', catalogId: 'dining-table' },
      { id: 'chair1', width: 0.85, depth: 0.85, category: 'seating', catalogId: 'armchair' },
      { id: 'chair2', width: 0.55, depth: 0.55, category: 'seating', catalogId: 'desk-chair' },
      { id: 'chair3', width: 0.45, depth: 0.5, category: 'seating', catalogId: 'wooden-chair' },
      { id: 'lamp', width: 0.4, depth: 0.4, category: 'lighting', catalogId: 'floor-lamp' },
      { id: 'shelf', width: 0.9, depth: 0.35, category: 'storage', catalogId: 'bookshelf' },
      { id: 'ward', width: 1.0, depth: 0.6, category: 'storage', catalogId: 'wardrobe' },
      { id: 'tv', width: 1.4, depth: 0.4, category: 'storage', catalogId: 'tv-stand' },
      { id: 'rug', width: 2.0, depth: 1.4, category: 'decor', catalogId: 'rug' },
      { id: 'plant', width: 0.5, depth: 0.5, category: 'decor', catalogId: 'plant' },
      { id: 'desk', width: 1.2, depth: 0.6, category: 'tables', catalogId: 'desk' },
      { id: 'side', width: 0.5, depth: 0.5, category: 'tables', catalogId: 'side-table' },
    ];
    const placed = suggestLayout(room, items);
    expect(placed.length).toBeGreaterThanOrEqual(items.length - 2);
    const byId = Object.fromEntries(placed.map((p) => [p.id, p]));
    const solid = items.filter((i) => !i.catalogId.includes('rug') && byId[i.id]);
    const hits = computeCollisions(
      solid.map((item) => {
        const p = byId[item.id]!;
        return {
          id: item.id,
          cx: p.x,
          cz: p.z,
          width: item.width,
          depth: item.depth,
          rotationDeg: p.rotationY,
        };
      }),
    );
    expect([...hits]).toEqual([]);
  });
});
