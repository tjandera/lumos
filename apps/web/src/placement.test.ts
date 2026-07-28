import { describe, expect, it } from 'vitest';
import { sampleScene, aabbOf, type SceneDocument } from '@interior/core';
import { approxFloorAreaM2, findFreePlacement, roomBounds } from './placement';

describe('roomBounds', () => {
  it('matches the sample room footprint (5m x 4m centered at the origin)', () => {
    expect(roomBounds(sampleScene)).toEqual({ minX: -2.5, maxX: 2.5, minZ: -2, maxZ: 2 });
  });

  it('falls back to a generic box when there are no rooms', () => {
    const empty: SceneDocument = { ...sampleScene, rooms: [] };
    expect(roomBounds(empty)).toEqual({ minX: -2.5, maxX: 2.5, minZ: -2, maxZ: 2 });
  });
});

describe('approxFloorAreaM2', () => {
  it('is ~20 m² for the 5x4 sample room', () => {
    expect(approxFloorAreaM2(sampleScene)).toBeCloseTo(20, 5);
  });
});

describe('findFreePlacement', () => {
  it('places the first item at the room center', () => {
    const empty: SceneDocument = { ...sampleScene, furniture: [] };
    const p = findFreePlacement(empty, 1, 1);
    expect(p).toEqual({ x: 0, z: 0, rotationY: 0 });
  });

  it('spirals outward when the center is already occupied', () => {
    const doc: SceneDocument = {
      ...sampleScene,
      furniture: [{ id: 'blocker', catalogId: 'coffee-table', position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1 }],
    };
    const p = findFreePlacement(doc, 0.6, 0.6);
    expect(p.x !== 0 || p.z !== 0).toBe(true);

    const newAabb = aabbOf({ id: 'new', cx: p.x, cz: p.z, width: 0.6, depth: 0.6, rotationDeg: 0 });
    const blockerAabb = aabbOf({ id: 'blocker', cx: 0, cz: 0, width: 1.1, depth: 0.6, rotationDeg: 0 });
    const overlaps =
      newAabb.minX < blockerAabb.maxX &&
      newAabb.maxX > blockerAabb.minX &&
      newAabb.minZ < blockerAabb.maxZ &&
      newAabb.maxZ > blockerAabb.minZ;
    expect(overlaps).toBe(false);
  });

  it('ignores rugs as obstacles', () => {
    const doc: SceneDocument = {
      ...sampleScene,
      furniture: [{ id: 'rug', catalogId: 'rug', position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1 }],
    };
    const p = findFreePlacement(doc, 0.6, 0.6);
    expect(p).toEqual({ x: 0, z: 0, rotationY: 0 });
  });

  it('excludes the given id (repositioning an existing item)', () => {
    const doc: SceneDocument = {
      ...sampleScene,
      furniture: [{ id: 'self', catalogId: 'coffee-table', position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1 }],
    };
    const p = findFreePlacement(doc, 0.6, 0.6, 'self');
    expect(p).toEqual({ x: 0, z: 0, rotationY: 0 });
  });

  it('stays within the room bounds', () => {
    const doc: SceneDocument = { ...sampleScene, furniture: [] };
    // A big item still has to fit within the 5x4 room with margin.
    const p = findFreePlacement(doc, 4.5, 3.5);
    const bounds = roomBounds(doc);
    expect(p.x - 2.25).toBeGreaterThanOrEqual(bounds.minX);
    expect(p.x + 2.25).toBeLessThanOrEqual(bounds.maxX);
  });
});
