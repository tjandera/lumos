import { describe, expect, it } from "vitest";
import { computeFitTransform, type Box3Like } from "./modelFit";

function box(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): Box3Like {
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

describe("computeFitTransform", () => {
  it("scales a unit cube up to a target footprint (uniform, contain-fit)", () => {
    const bbox = box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5);
    const { scale } = computeFitTransform(bbox, { w: 2, d: 2, h: 2 });
    expect(scale).toBeCloseTo(2, 10);
  });

  it("picks the smallest per-axis ratio so the model never exceeds any target dimension", () => {
    // 1x1x1 box, target wants 2 on X but only 1 on Y — height is the binding constraint.
    const bbox = box(0, 0, 0, 1, 1, 1);
    const { scale } = computeFitTransform(bbox, { w: 2, d: 2, h: 1 });
    expect(scale).toBeCloseTo(1, 10);
  });

  it("centers the model on X and Z", () => {
    const bbox = box(1, 0, 4, 3, 2, 6); // size 2x2x2, center (2, 1, 5)
    const { scale, position } = computeFitTransform(bbox, { w: 2, d: 2, h: 2 });
    expect(scale).toBeCloseTo(1, 10);
    // After scaling by 1, translating by -center*scale should bring center to (0, *, 0).
    expect(position[0]).toBeCloseTo(-2, 10);
    expect(position[2]).toBeCloseTo(-5, 10);
  });

  it("rests the model's lowest point on the floor (y = 0)", () => {
    const bbox = box(-1, 3, -1, 1, 5, 1); // min.y = 3, size 2x2x2
    const { scale, position } = computeFitTransform(bbox, { w: 2, d: 2, h: 2 });
    // scaled min.y should map to 0: position.y + min.y * scale === 0
    expect(position[1] + bbox.min.y * scale).toBeCloseTo(0, 10);
    expect(position[1]).toBeCloseTo(-3, 10);
  });

  it("handles an off-center, non-uniform bounding box (realistic chair-shaped bbox)", () => {
    // A chair-like bbox: 0.5 wide, 1.4 tall, 0.6 deep, offset from origin.
    const bbox = box(2.1, 0.2, -0.3, 2.6, 1.6, 0.3);
    const target = { w: 0.45, d: 0.5, h: 0.9 };
    const { scale, position } = computeFitTransform(bbox, target);
    // size = (0.5, 1.4, 0.6); ratios = (0.9, 0.6428..., 0.8333...) -> min is height ratio
    expect(scale).toBeCloseTo(0.9 / 1.4, 10);
    // Verify the fitted box actually sits on the floor and is footprint-centered.
    const fittedMinY = position[1] + bbox.min.y * scale;
    const fittedCenterX = position[0] + ((bbox.min.x + bbox.max.x) / 2) * scale;
    const fittedCenterZ = position[2] + ((bbox.min.z + bbox.max.z) / 2) * scale;
    expect(fittedMinY).toBeCloseTo(0, 10);
    expect(fittedCenterX).toBeCloseTo(0, 10);
    expect(fittedCenterZ).toBeCloseTo(0, 10);
  });

  it("guards against a degenerate (zero-thickness) bounding box without producing NaN/Infinity", () => {
    const bbox = box(-1, 0, -1, 1, 0, 1); // zero height
    const { scale, position } = computeFitTransform(bbox, { w: 1, d: 1, h: 1 });
    expect(Number.isFinite(scale)).toBe(true);
    expect(position.every((n) => Number.isFinite(n))).toBe(true);
  });

  it("falls back to scale 1 for a fully degenerate (point) bounding box", () => {
    const bbox = box(0, 0, 0, 0, 0, 0);
    const { scale } = computeFitTransform(bbox, { w: 1, d: 1, h: 1 });
    expect(scale).toBe(1);
  });
});
