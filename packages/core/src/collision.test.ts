import { describe, expect, it } from "vitest";
import { aabbIntersects, aabbOverlap, furnitureAABB } from "./collision.js";
import type { FurnitureItem } from "./types.js";

function makeItem(overrides: Partial<FurnitureItem> = {}): FurnitureItem {
  return {
    id: "item",
    catalogId: "catalog-x",
    position: { x: 0, y: 0, z: 0 },
    rotationY: 0,
    dimensions: { w: 2, d: 1, h: 1 },
    ...overrides
  };
}

describe("furnitureAABB", () => {
  it("computes bounds for an unrotated item", () => {
    const box = furnitureAABB(makeItem({ position: { x: 1, y: 0, z: 2 }, dimensions: { w: 2, d: 4, h: 1 } }));

    expect(box).toEqual({ minX: 0, maxX: 2, minZ: 0, maxZ: 4 });
  });

  it("swaps extents for a 90 degree rotation", () => {
    const box = furnitureAABB(
      makeItem({ position: { x: 0, y: 0, z: 0 }, dimensions: { w: 2, d: 4, h: 1 }, rotationY: Math.PI / 2 })
    );

    expect(box.minX).toBeCloseTo(-2);
    expect(box.maxX).toBeCloseTo(2);
    expect(box.minZ).toBeCloseTo(-1);
    expect(box.maxZ).toBeCloseTo(1);
  });
});

describe("aabbIntersects", () => {
  it("detects overlapping boxes", () => {
    const a = { minX: 0, maxX: 2, minZ: 0, maxZ: 2 };
    const b = { minX: 1, maxX: 3, minZ: 1, maxZ: 3 };

    expect(aabbIntersects(a, b)).toBe(true);
  });

  it("does not treat touching edges as overlapping", () => {
    const a = { minX: 0, maxX: 2, minZ: 0, maxZ: 2 };
    const b = { minX: 2, maxX: 4, minZ: 0, maxZ: 2 };

    expect(aabbIntersects(a, b)).toBe(false);
  });

  it("does not treat touching corners as overlapping", () => {
    const a = { minX: 0, maxX: 2, minZ: 0, maxZ: 2 };
    const b = { minX: 2, maxX: 4, minZ: 2, maxZ: 4 };

    expect(aabbIntersects(a, b)).toBe(false);
  });

  it("returns false for boxes far apart", () => {
    const a = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };
    const b = { minX: 10, maxX: 11, minZ: 10, maxZ: 11 };

    expect(aabbIntersects(a, b)).toBe(false);
  });

  it("detects one box fully containing another as overlapping", () => {
    const a = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
    const b = { minX: 4, maxX: 6, minZ: 4, maxZ: 6 };

    expect(aabbIntersects(a, b)).toBe(true);
  });
});

describe("aabbOverlap", () => {
  it("returns false when two items are placed side by side, flush", () => {
    const a = makeItem({ id: "a", position: { x: 0, y: 0, z: 0 }, dimensions: { w: 2, d: 2, h: 1 } });
    const b = makeItem({ id: "b", position: { x: 2, y: 0, z: 0 }, dimensions: { w: 2, d: 2, h: 1 } });

    expect(aabbOverlap(a, b)).toBe(false);
  });

  it("returns true when two items overlap", () => {
    const a = makeItem({ id: "a", position: { x: 0, y: 0, z: 0 }, dimensions: { w: 2, d: 2, h: 1 } });
    const b = makeItem({ id: "b", position: { x: 1, y: 0, z: 0 }, dimensions: { w: 2, d: 2, h: 1 } });

    expect(aabbOverlap(a, b)).toBe(true);
  });

  it("returns false for the same item compared with an identical clone offset just past the edge", () => {
    const a = makeItem({ id: "a", position: { x: 0, y: 0, z: 0 }, dimensions: { w: 1, d: 1, h: 1 } });
    const b = makeItem({ id: "b", position: { x: 1.001, y: 0, z: 0 }, dimensions: { w: 1, d: 1, h: 1 } });

    expect(aabbOverlap(a, b)).toBe(false);
  });

  it("accounts for rotation when checking overlap", () => {
    const a = makeItem({ id: "a", position: { x: 0, y: 0, z: 0 }, dimensions: { w: 4, d: 1, h: 1 } });
    const b = makeItem({
      id: "b",
      position: { x: 0, y: 0, z: 1.4 },
      dimensions: { w: 4, d: 1, h: 1 },
      rotationY: Math.PI / 2
    });

    // b rotated 90deg becomes 1 wide / 4 deep, centered 1.4 away in z,
    // so its extent reaches z in [-0.6, 3.4] while a reaches [-0.5, 0.5] -> overlap
    expect(aabbOverlap(a, b)).toBe(true);
  });
});
