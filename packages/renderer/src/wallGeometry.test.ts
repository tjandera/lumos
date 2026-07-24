import { describe, it, expect } from 'vitest';
import { computeWallShape } from './wallGeometry';
import type { Wall, Opening } from '@interior/core';

const wall: Wall = {
  id: 'wall-S',
  start: { x: -2.5, z: 2 },
  end: { x: 2.5, z: 2 },
  thickness: 0.12,
  height: 2.7,
};

describe('computeWallShape', () => {
  it('measures wall length from its endpoints', () => {
    expect(computeWallShape(wall, []).length).toBeCloseTo(5);
  });

  it('creates a hole for an opening on this wall', () => {
    const opening: Opening = {
      id: 'win-1',
      wallId: 'wall-S',
      kind: 'window',
      offset: 1.7,
      width: 1.6,
      height: 1.2,
      sillHeight: 0.9,
    };
    const shape = computeWallShape(wall, [opening]);
    expect(shape.holes).toHaveLength(1);
    expect(shape.holes[0]).toEqual({ x0: 1.7, y0: 0.9, x1: 3.3, y1: 2.1 });
  });

  it('ignores openings that belong to other walls', () => {
    const opening: Opening = {
      id: 'door-1',
      wallId: 'wall-W',
      kind: 'door',
      offset: 0.4,
      width: 0.9,
      height: 2.1,
      sillHeight: 0,
    };
    expect(computeWallShape(wall, [opening]).holes).toHaveLength(0);
  });

  it('clamps an opening that would exceed the wall bounds', () => {
    const opening: Opening = {
      id: 'win-x',
      wallId: 'wall-S',
      kind: 'window',
      offset: 4.5,
      width: 2,
      height: 1,
      sillHeight: 2.4,
    };
    // width clamps to [4.5, 5], height clamps to [2.4, 2.7]
    expect(computeWallShape(wall, [opening]).holes[0]).toEqual({
      x0: 4.5,
      y0: 2.4,
      x1: 5,
      y1: 2.7,
    });
  });
});
