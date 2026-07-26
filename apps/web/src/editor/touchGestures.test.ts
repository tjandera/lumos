import { describe, expect, it } from "vitest";
import { computePinchZoom, pinchDistance, pinchMidpoint } from "./touchGestures";

describe("pinchDistance", () => {
  it("computes euclidean distance between two touch points", () => {
    expect(pinchDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("pinchMidpoint", () => {
  it("computes the midpoint between two touch points", () => {
    expect(pinchMidpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });
});

describe("computePinchZoom", () => {
  const viewport = { scale: 80, offsetX: 400, offsetY: 300 };

  it("doubles scale when finger distance doubles", () => {
    const result = computePinchZoom(
      viewport,
      100,
      { x: 400, y: 300 },
      200,
      { x: 400, y: 300 },
      10,
      400
    );
    expect(result.scale).toBeCloseTo(160);
  });

  it("halves scale when finger distance halves", () => {
    const result = computePinchZoom(
      viewport,
      200,
      { x: 400, y: 300 },
      100,
      { x: 400, y: 300 },
      10,
      400
    );
    expect(result.scale).toBeCloseTo(40);
  });

  it("clamps scale to the provided min/max", () => {
    const zoomedIn = computePinchZoom(viewport, 10, { x: 0, y: 0 }, 10_000, { x: 0, y: 0 }, 10, 400);
    expect(zoomedIn.scale).toBe(400);

    const zoomedOut = computePinchZoom(viewport, 10_000, { x: 0, y: 0 }, 1, { x: 0, y: 0 }, 10, 400);
    expect(zoomedOut.scale).toBe(10);
  });

  it("keeps the world point under the pinch midpoint stable when zooming in place", () => {
    // World point under (400, 300) at scale 80, offset (400, 300) is (0, 0).
    const result = computePinchZoom(viewport, 100, { x: 400, y: 300 }, 200, { x: 400, y: 300 });
    const worldXAfter = (400 - result.offsetX) / result.scale;
    const worldYAfter = (300 - result.offsetY) / result.scale;
    expect(worldXAfter).toBeCloseTo(0);
    expect(worldYAfter).toBeCloseTo(0);
  });

  it("pans when the pinch midpoint moves, in addition to zooming", () => {
    // Same distance (no zoom), midpoint moves 50px right and 20px down -> viewport should pan by the same amount.
    const result = computePinchZoom(viewport, 100, { x: 400, y: 300 }, 100, { x: 450, y: 320 });
    expect(result.scale).toBeCloseTo(80);
    expect(result.offsetX).toBeCloseTo(450);
    expect(result.offsetY).toBeCloseTo(320);
  });

  it("is a no-op when the previous distance is zero (avoids div-by-zero)", () => {
    const result = computePinchZoom(viewport, 0, { x: 400, y: 300 }, 100, { x: 450, y: 320 });
    expect(result).toEqual(viewport);
  });
});
