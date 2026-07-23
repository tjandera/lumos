import { describe, expect, it } from "vitest";
import {
  deriveWallSegments,
  isClockwise,
  openingCenter,
  openingFitsWall,
  openingSpan,
  pointAlongWall,
  polygonAbsArea,
  polygonArea,
  polygonCentroid
} from "./geometry.js";
import type { Opening, Point2D, Room } from "./types.js";

// A 4x3 rectangle, counter-clockwise in standard (y-up) axes.
const RECT: Point2D[] = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 3 },
  { x: 0, y: 3 }
];

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "room-1",
    name: "Test room",
    walls: RECT,
    wallThickness: 0.2,
    height: 2.5,
    openings: [],
    ...overrides
  };
}

describe("deriveWallSegments", () => {
  it("produces one segment per edge including the closing edge", () => {
    const segments = deriveWallSegments(RECT);
    expect(segments).toHaveLength(4);
    expect(segments.map((s) => s.index)).toEqual([0, 1, 2, 3]);
  });

  it("closes the loop from the last corner back to the first", () => {
    const segments = deriveWallSegments(RECT);
    const last = segments[3]!;
    expect(last.start).toEqual({ x: 0, y: 3 });
    expect(last.end).toEqual({ x: 0, y: 0 });
  });

  it("computes segment lengths", () => {
    const lengths = deriveWallSegments(RECT).map((s) => s.length);
    expect(lengths).toEqual([4, 3, 4, 3]);
  });

  it("computes unit direction and clockwise normal", () => {
    const seg = deriveWallSegments(RECT)[0]!; // (0,0) -> (4,0)
    expect(seg.dir.x).toBeCloseTo(1);
    expect(seg.dir.y).toBeCloseTo(0);
    // normal is dir rotated -90deg: (dir.y, -dir.x) = (0, -1)
    expect(seg.normal.x).toBeCloseTo(0);
    expect(seg.normal.y).toBeCloseTo(-1);
  });

  it("returns no segments for fewer than two corners", () => {
    expect(deriveWallSegments([])).toEqual([]);
    expect(deriveWallSegments([{ x: 0, y: 0 }])).toEqual([]);
  });

  it("marks a degenerate zero-length segment with a zero direction vector", () => {
    const segments = deriveWallSegments([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 }
    ]);
    expect(segments[0]!.length).toBe(0);
    expect(segments[0]!.dir).toEqual({ x: 0, y: 0 });
  });
});

describe("polygonArea", () => {
  it("returns the signed area, positive for counter-clockwise winding", () => {
    expect(polygonArea(RECT)).toBeCloseTo(12);
  });

  it("returns the negated area for clockwise winding", () => {
    expect(polygonArea([...RECT].reverse())).toBeCloseTo(-12);
  });

  it("returns 0 for degenerate polygons", () => {
    expect(polygonArea([])).toBe(0);
    expect(polygonArea([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
  });

  it("computes area of a concave (L-shaped) polygon", () => {
    // 4x4 square with a 2x2 bite taken out of the top-right -> area 12.
    const lShape: Point2D[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 4 },
      { x: 0, y: 4 }
    ];
    expect(polygonAbsArea(lShape)).toBeCloseTo(12);
  });
});

describe("isClockwise", () => {
  it("is false for counter-clockwise polygons", () => {
    expect(isClockwise(RECT)).toBe(false);
  });
  it("is true for clockwise polygons", () => {
    expect(isClockwise([...RECT].reverse())).toBe(true);
  });
});

describe("polygonCentroid", () => {
  it("finds the center of a rectangle", () => {
    const c = polygonCentroid(RECT);
    expect(c.x).toBeCloseTo(2);
    expect(c.y).toBeCloseTo(1.5);
  });

  it("is winding-independent", () => {
    const c = polygonCentroid([...RECT].reverse());
    expect(c.x).toBeCloseTo(2);
    expect(c.y).toBeCloseTo(1.5);
  });
});

describe("pointAlongWall", () => {
  it("interpolates a point at a distance along the segment", () => {
    const seg = deriveWallSegments(RECT)[0]!; // (0,0) -> (4,0)
    expect(pointAlongWall(seg, 1)).toEqual({ x: 1, y: 0 });
    expect(pointAlongWall(seg, 4)).toEqual({ x: 4, y: 0 });
  });
});

describe("openingSpan", () => {
  it("returns start/end from a centered position and width", () => {
    const opening: Opening = {
      id: "w1",
      type: "window",
      wallIndex: 0,
      position: 2,
      width: 1,
      height: 1.2,
      sillHeight: 0.9
    };
    expect(openingSpan(opening)).toEqual({ start: 1.5, end: 2.5 });
  });
});

describe("openingCenter", () => {
  it("resolves the 2D center point of an opening on its wall", () => {
    const room = makeRoom({
      openings: [
        { id: "d1", type: "door", wallIndex: 0, position: 2, width: 1, height: 2, sillHeight: 0 }
      ]
    });
    expect(openingCenter(room, room.openings[0]!)).toEqual({ x: 2, y: 0 });
  });

  it("resolves openings on a non-axis-aligned closing wall", () => {
    const room = makeRoom({
      openings: [
        { id: "w1", type: "window", wallIndex: 3, position: 1.5, width: 1, height: 1, sillHeight: 1 }
      ]
    });
    // wall 3 runs (0,3) -> (0,0), so 1.5 down y from start
    expect(openingCenter(room, room.openings[0]!)).toEqual({ x: 0, y: 1.5 });
  });

  it("returns null for an out-of-range wall index", () => {
    const room = makeRoom();
    const bad: Opening = { id: "x", type: "door", wallIndex: 9, position: 1, width: 1, height: 2, sillHeight: 0 };
    expect(openingCenter(room, bad)).toBeNull();
  });
});

describe("openingFitsWall", () => {
  it("accepts an opening fully within the wall", () => {
    const room = makeRoom();
    const opening: Opening = { id: "w", type: "window", wallIndex: 0, position: 2, width: 1, height: 1, sillHeight: 1 };
    expect(openingFitsWall(room, opening)).toBe(true);
  });

  it("rejects an opening that overruns the wall end", () => {
    const room = makeRoom();
    const opening: Opening = { id: "w", type: "window", wallIndex: 1, position: 3, width: 1, height: 1, sillHeight: 1 };
    // wall 1 has length 3; position 3 + half-width 0.5 = 3.5 > 3
    expect(openingFitsWall(room, opening)).toBe(false);
  });

  it("rejects an opening on a non-existent wall", () => {
    const room = makeRoom();
    const opening: Opening = { id: "w", type: "window", wallIndex: 42, position: 1, width: 1, height: 1, sillHeight: 1 };
    expect(openingFitsWall(room, opening)).toBe(false);
  });
});
