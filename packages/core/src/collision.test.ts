import { describe, it, expect } from 'vitest';
import { computeCollisions } from './collision.js';

describe('computeCollisions', () => {
  it('flags two overlapping items', () => {
    const hit = computeCollisions([
      { id: 'a', cx: 0, cz: 0, width: 1, depth: 1, rotationDeg: 0 },
      { id: 'b', cx: 0.5, cz: 0, width: 1, depth: 1, rotationDeg: 0 },
    ]);
    expect(hit).toEqual(new Set(['a', 'b']));
  });

  it('does not flag items that are clearly apart', () => {
    const hit = computeCollisions([
      { id: 'a', cx: 0, cz: 0, width: 1, depth: 1, rotationDeg: 0 },
      { id: 'b', cx: 3, cz: 0, width: 1, depth: 1, rotationDeg: 0 },
    ]);
    expect(hit.size).toBe(0);
  });

  it('does not flag items that only touch at an edge', () => {
    const hit = computeCollisions([
      { id: 'a', cx: 0, cz: 0, width: 1, depth: 1, rotationDeg: 0 },
      { id: 'b', cx: 1, cz: 0, width: 1, depth: 1, rotationDeg: 0 }, // meet exactly at x = 0.5
    ]);
    expect(hit.size).toBe(0);
  });

  it('accounts for rotation when computing the footprint', () => {
    // A 2.0 x 0.2 bar rotated 90° spans ~2.0 along z, reaching its neighbor.
    const hit = computeCollisions([
      { id: 'a', cx: 0, cz: 0, width: 2, depth: 0.2, rotationDeg: 90 },
      { id: 'b', cx: 0, cz: 0.8, width: 1, depth: 0.2, rotationDeg: 0 },
    ]);
    expect(hit.has('a')).toBe(true);
    expect(hit.has('b')).toBe(true);
  });
});
