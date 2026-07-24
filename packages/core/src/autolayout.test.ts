import { describe, it, expect } from 'vitest';
import { suggestLayout } from './autolayout';
import { computeCollisions } from './collision';

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

    const hits = computeCollisions(
      placed.map((p, i) => ({
        id: p.id,
        cx: p.x,
        cz: p.z,
        width: items[i].width,
        depth: items[i].depth,
        rotationDeg: p.rotationY,
      })),
    );
    expect(hits.size).toBe(0);
  });

  it('keeps item centers inside the room', () => {
    const [p] = suggestLayout(room, [{ id: 'a', width: 1.0, depth: 0.6 }]);
    expect(p.x).toBeGreaterThanOrEqual(room.minX);
    expect(p.x).toBeLessThanOrEqual(room.maxX);
    expect(p.z).toBeGreaterThanOrEqual(room.minZ);
    expect(p.z).toBeLessThanOrEqual(room.maxZ);
  });
});
