import { describe, expect, it } from "vitest";
import {
  angleDeg,
  closestPointOnSegment,
  distance,
  formatMeters,
  isNear,
  pointAlongWall,
  projectOntoWall,
  snapAngle,
  snapPoint,
  snapToGrid,
  wallSegments
} from "./geometry";

describe("snapToGrid", () => {
  it("snaps to the nearest grid intersection", () => {
    const result = snapToGrid({ x: 0.34, y: 0.06 }, 0.1);
    expect(result.x).toBeCloseTo(0.3);
    expect(result.y).toBeCloseTo(0.1);
  });

  it("is a no-op for gridSize <= 0", () => {
    expect(snapToGrid({ x: 1.234, y: 5.678 }, 0)).toEqual({ x: 1.234, y: 5.678 });
  });
});

describe("angleDeg", () => {
  it("returns 0 for a point directly to the right", () => {
    expect(angleDeg({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(0);
  });

  it("returns 90 for a point directly below (screen-space +Y)", () => {
    expect(angleDeg({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90);
  });

  it("wraps negative angles into [0, 360)", () => {
    expect(angleDeg({ x: 0, y: 0 }, { x: 0, y: -1 })).toBeCloseTo(270);
  });
});

describe("snapAngle", () => {
  it("snaps a near-horizontal segment to exactly 0 degrees", () => {
    const anchor = { x: 0, y: 0 };
    const point = { x: 2, y: 0.05 };
    const result = snapAngle(anchor, point, 90, 6);
    expect(result.y).toBeCloseTo(0, 5);
    expect(distance(anchor, result)).toBeCloseTo(distance(anchor, point), 5);
  });

  it("snaps a near-vertical segment to exactly 90 degrees", () => {
    const anchor = { x: 0, y: 0 };
    const point = { x: 0.05, y: 3 };
    const result = snapAngle(anchor, point, 90, 6);
    expect(result.x).toBeCloseTo(0, 5);
  });

  it("leaves the point unchanged if outside tolerance", () => {
    const anchor = { x: 0, y: 0 };
    const point = { x: 1, y: 0.5 }; // ~26.5 degrees, well outside 6deg tolerance of 0
    const result = snapAngle(anchor, point, 90, 6);
    expect(result).toEqual(point);
  });

  it("returns the point unchanged when anchor and point coincide", () => {
    const anchor = { x: 1, y: 1 };
    expect(snapAngle(anchor, { x: 1, y: 1 })).toEqual({ x: 1, y: 1 });
  });
});

describe("snapPoint", () => {
  it("applies grid snap only when no anchor given", () => {
    const result = snapPoint({ x: 1.02, y: 2.03 }, 0.1);
    expect(result).toEqual({ x: 1, y: 2 });
  });

  it("applies angle snap relative to anchor, then re-snaps to grid", () => {
    const anchor = { x: 0, y: 0 };
    const result = snapPoint({ x: 2.02, y: 0.03 }, 0.1, anchor, true, 90);
    expect(result.y).toBeCloseTo(0, 5);
  });

  it("skips angle snap when disabled", () => {
    const anchor = { x: 0, y: 0 };
    const result = snapPoint({ x: 2, y: 0.5 }, 0.1, anchor, false, 90);
    expect(result).toEqual({ x: 2, y: 0.5 });
  });
});

describe("formatMeters", () => {
  it("formats to two decimals with unit suffix", () => {
    expect(formatMeters(3.2054)).toBe("3.21 m");
    expect(formatMeters(0)).toBe("0.00 m");
  });
});

describe("isNear", () => {
  it("is true within radius, false outside", () => {
    expect(isNear({ x: 0, y: 0 }, { x: 3, y: 4 }, 5)).toBe(true);
    expect(isNear({ x: 0, y: 0 }, { x: 3, y: 4 }, 4.9)).toBe(false);
  });
});

describe("wallSegments", () => {
  it("builds closed-loop segments including the wrap-around segment", () => {
    const walls = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 }
    ];
    const segments = wallSegments(walls);
    expect(segments).toHaveLength(3);
    expect(segments[2]).toMatchObject({ index: 2, start: { x: 4, y: 3 }, end: { x: 0, y: 0 } });
    expect(segments[0]!.length).toBeCloseTo(4);
  });

  it("returns an empty array for fewer than 2 points", () => {
    expect(wallSegments([])).toEqual([]);
    expect(wallSegments([{ x: 0, y: 0 }])).toEqual([]);
  });
});

describe("projectOntoWall / pointAlongWall", () => {
  const segment = wallSegments([
    { x: 0, y: 0 },
    { x: 4, y: 0 }
  ])[0]!;

  it("projects a perpendicular point to its foot on the segment", () => {
    expect(projectOntoWall({ x: 2, y: 5 }, segment)).toBeCloseTo(2);
  });

  it("clamps projection to the segment bounds", () => {
    expect(projectOntoWall({ x: -3, y: 0 }, segment)).toBeCloseTo(0);
    expect(projectOntoWall({ x: 10, y: 0 }, segment)).toBeCloseTo(4);
  });

  it("pointAlongWall is the inverse of projectOntoWall for interior points", () => {
    const p = pointAlongWall(segment, 1.5);
    expect(p).toEqual({ x: 1.5, y: 0 });
    expect(projectOntoWall(p, segment)).toBeCloseTo(1.5);
  });
});

describe("closestPointOnSegment", () => {
  it("finds perpendicular distance and t for a mid-segment point", () => {
    const segment = wallSegments([
      { x: 0, y: 0 },
      { x: 0, y: 10 }
    ])[0]!;
    const result = closestPointOnSegment({ x: 3, y: 5 }, segment);
    expect(result.distance).toBeCloseTo(3);
    expect(result.t).toBeCloseTo(0.5);
    expect(result.point).toEqual({ x: 0, y: 5 });
  });

  it("handles zero-length segments", () => {
    const segment = wallSegments([
      { x: 1, y: 1 },
      { x: 1, y: 1 }
    ])[0]!;
    const result = closestPointOnSegment({ x: 4, y: 5 }, segment);
    expect(result.point).toEqual({ x: 1, y: 1 });
    expect(result.distance).toBeCloseTo(5);
  });
});
