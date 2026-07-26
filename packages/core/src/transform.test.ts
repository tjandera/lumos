import { describe, it, expect } from 'vitest';
import { rotateBuilding } from './transform';
import { sampleScene } from './sample';
import type { SceneDocument } from './schema';

function wallLength(w: { start: { x: number; z: number }; end: { x: number; z: number } }): number {
  return Math.hypot(w.end.x - w.start.x, w.end.z - w.start.z);
}

describe('rotateBuilding', () => {
  it('is a no-op for 0 and 360 degrees', () => {
    expect(rotateBuilding(sampleScene, 0)).toBe(sampleScene);
    expect(rotateBuilding(sampleScene, 360)).toBe(sampleScene);
  });

  it('preserves every wall length', () => {
    const rotated = rotateBuilding(sampleScene, 37);
    const before = sampleScene.rooms[0].walls.map(wallLength);
    const after = rotated.rooms[0].walls.map(wallLength);
    before.forEach((len, i) => expect(after[i]).toBeCloseTo(len, 3));
  });

  it('leaves site.trueNorthOffsetDeg untouched', () => {
    const rotated = rotateBuilding(sampleScene, 90);
    expect(rotated.site).toEqual(sampleScene.site);
  });

  it('moves furniture around the room center and bumps rotationY by the same delta', () => {
    const rotated = rotateBuilding(sampleScene, 90);
    const before = sampleScene.furniture[0];
    const after = rotated.furniture.find((f) => f.id === before.id)!;
    expect(after.position).not.toEqual(before.position);
    expect(after.rotationY).toBeCloseTo((before.rotationY + 90) % 360, 3);
  });

  it('keeps furniture at a fixed offset from the wall it was against (rigid transform)', () => {
    // A furniture item glued to the middle of a wall should stay glued to that same
    // wall's midpoint after the whole building rotates — not just rotate in place.
    const doc: SceneDocument = {
      ...sampleScene,
      rooms: [
        {
          ...sampleScene.rooms[0],
          walls: [
            { id: 'wall-N', start: { x: -2, z: -2 }, end: { x: 2, z: -2 }, thickness: 0.1, height: 2.7 },
            { id: 'wall-S', start: { x: -2, z: 2 }, end: { x: 2, z: 2 }, thickness: 0.1, height: 2.7 },
            { id: 'wall-W', start: { x: -2, z: -2 }, end: { x: -2, z: 2 }, thickness: 0.1, height: 2.7 },
            { id: 'wall-E', start: { x: 2, z: -2 }, end: { x: 2, z: 2 }, thickness: 0.1, height: 2.7 },
          ],
        },
      ],
      furniture: [{ id: 'f-1', catalogId: 'bench', position: { x: 0, y: 0, z: -1.9 }, rotationY: 0, scale: 1 }],
      openings: [],
      lights: [],
    };
    const rotated = rotateBuilding(doc, 90);
    const wallN = rotated.rooms[0].walls.find((w) => w.id === 'wall-N')!;
    const midN = { x: (wallN.start.x + wallN.end.x) / 2, z: (wallN.start.z + wallN.end.z) / 2 };
    const f = rotated.furniture[0];
    // distance from the furniture to the (now-rotated) north wall's midpoint should be
    // unchanged from before rotating (0.1 in the original, along -Z).
    const distBefore = Math.hypot(0 - (-2 + 2) / 2, -1.9 - -2);
    const distAfter = Math.hypot(f.position.x - midN.x, f.position.z - midN.z);
    expect(distAfter).toBeCloseTo(distBefore, 2);
  });

  it('round-trips back to the original positions after rotating by the inverse angle', () => {
    const rotated = rotateBuilding(sampleScene, 40);
    const back = rotateBuilding(rotated, -40);
    sampleScene.rooms[0].walls.forEach((w, i) => {
      expect(back.rooms[0].walls[i].start.x).toBeCloseTo(w.start.x, 2);
      expect(back.rooms[0].walls[i].start.z).toBeCloseTo(w.start.z, 2);
    });
  });

  it('rotates light fixtures around the same center', () => {
    const doc: SceneDocument = {
      ...sampleScene,
      lights: [
        {
          id: 'l-1',
          kind: 'ceiling',
          position: { x: 1, y: 2.6, z: 0 },
          intensityCandela: 300,
          color: '#ffffff',
          kelvin: 2700,
          on: true,
          castShadow: true,
          auto: false,
        },
      ],
    };
    const rotated = rotateBuilding(doc, 90);
    const l = rotated.lights[0];
    expect(l.position.y).toBe(2.6); // vertical position untouched
    expect(l.position.x).not.toBeCloseTo(1, 3);
  });
});
