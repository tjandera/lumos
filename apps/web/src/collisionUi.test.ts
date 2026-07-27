import { describe, expect, it } from 'vitest';
import { sampleScene, type SceneDocument } from '@interior/core';
import { collidingFurnitureIds } from './collisionUi';

function withFurniture(furniture: SceneDocument['furniture']): SceneDocument {
  return { ...sampleScene, furniture };
}

describe('collidingFurnitureIds', () => {
  it('is empty for the (hand-placed, non-overlapping) Marina Studio sample', () => {
    // The sample scene's own rug intentionally overlaps other pieces — that's the
    // exact case this function is meant to ignore.
    expect(collidingFurnitureIds(sampleScene).size).toBe(0);
  });

  it('flags two overlapping items', () => {
    const doc = withFurniture([
      { id: 'a', catalogId: 'coffee-table', position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1 },
      { id: 'b', catalogId: 'coffee-table', position: { x: 0.2, y: 0, z: 0 }, rotationY: 0, scale: 1 },
    ]);
    const hits = collidingFurnitureIds(doc);
    expect(hits.has('a')).toBe(true);
    expect(hits.has('b')).toBe(true);
  });

  it('does not flag two items placed clear of each other', () => {
    const doc = withFurniture([
      { id: 'a', catalogId: 'side-table', position: { x: -1.9, y: 0, z: -1.9 }, rotationY: 0, scale: 1 },
      { id: 'b', catalogId: 'side-table', position: { x: 1.9, y: 0, z: 1.9 }, rotationY: 0, scale: 1 },
    ]);
    expect(collidingFurnitureIds(doc).size).toBe(0);
  });

  it('ignores rugs even when they overlap other furniture', () => {
    const doc = withFurniture([
      { id: 'table', catalogId: 'coffee-table', position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1 },
      { id: 'rug', catalogId: 'rug', position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1 },
      { id: 'round-rug', catalogId: 'rug-round', position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1 },
    ]);
    expect(collidingFurnitureIds(doc).size).toBe(0);
  });

  it('falls back to the DEFAULT_ITEM footprint for an unknown catalogId', () => {
    const doc = withFurniture([
      { id: 'a', catalogId: 'not-a-real-item', position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1 },
      { id: 'b', catalogId: 'not-a-real-item', position: { x: 0.1, y: 0, z: 0 }, rotationY: 0, scale: 1 },
    ]);
    expect(collidingFurnitureIds(doc).size).toBe(2);
  });
});
