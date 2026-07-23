import { describe, expect, it } from "vitest";
import type { Room } from "@interior/core";
import {
  clampToRoom,
  footprintRect,
  isInsideRoom,
  roomInteriorBounds,
  rotatedHalfExtents,
  snapPositionToGrid,
  snapScalar,
  snapToWall,
  wallDistances
} from "./furniturePlacement";

/** A 4m (X) × 3m (Z) rectangular room with 0.2m walls, corners in plan space. */
function makeRoom(): Room {
  return {
    id: "room1",
    name: "Test",
    // plan (x, y) -> world (x, z); CCW-ish loop
    walls: [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 }
    ],
    wallThickness: 0.2,
    height: 2.4,
    openings: []
  };
}

describe("rotatedHalfExtents", () => {
  it("returns half w/d unrotated", () => {
    const { hx, hz } = rotatedHalfExtents({ w: 2, d: 1, h: 0.8 }, 0);
    expect(hx).toBeCloseTo(1);
    expect(hz).toBeCloseTo(0.5);
  });

  it("swaps extents at 90 degrees", () => {
    const { hx, hz } = rotatedHalfExtents({ w: 2, d: 1, h: 0.8 }, Math.PI / 2);
    expect(hx).toBeCloseTo(0.5);
    expect(hz).toBeCloseTo(1);
  });
});

describe("roomInteriorBounds", () => {
  it("insets the corner bounds by half the wall thickness", () => {
    const inner = roomInteriorBounds(makeRoom())!;
    expect(inner.minX).toBeCloseTo(0.1);
    expect(inner.maxX).toBeCloseTo(3.9);
    expect(inner.minZ).toBeCloseTo(0.1);
    expect(inner.maxZ).toBeCloseTo(2.9);
  });
});

describe("wallDistances", () => {
  it("reports gaps to each interior wall face", () => {
    const room = makeRoom();
    // 1×1 footprint centered at (2, 1.5)
    const rect = footprintRect({ x: 2, y: 0, z: 1.5 }, 0.5, 0.5);
    const d = wallDistances(rect, room)!;
    expect(d.minusX).toBeCloseTo(2 - 0.5 - 0.1); // 1.4
    expect(d.plusX).toBeCloseTo(3.9 - 2.5); // 1.4
    expect(d.minusZ).toBeCloseTo(1.5 - 0.5 - 0.1); // 0.9
    expect(d.plusZ).toBeCloseTo(2.9 - 2.0); // 0.9
  });

  it("goes negative when the footprint pokes past a wall face", () => {
    const room = makeRoom();
    const rect = footprintRect({ x: 0.2, y: 0, z: 1.5 }, 0.5, 0.5);
    const d = wallDistances(rect, room)!;
    expect(d.minusX).toBeLessThan(0); // minX = -0.3 < interior 0.1
  });
});

describe("clampToRoom", () => {
  it("keeps an in-bounds item unchanged", () => {
    const room = makeRoom();
    const pos = clampToRoom({ x: 2, y: 0, z: 1.5 }, 0.5, 0.5, room);
    expect(pos.x).toBeCloseTo(2);
    expect(pos.z).toBeCloseTo(1.5);
  });

  it("pulls an out-of-bounds item back inside", () => {
    const room = makeRoom();
    const pos = clampToRoom({ x: 5, y: 0, z: -1 }, 0.5, 0.5, room);
    expect(pos.x).toBeCloseTo(3.9 - 0.5); // 3.4
    expect(pos.z).toBeCloseTo(0.1 + 0.5); // 0.6
  });

  it("centers an item larger than the room on that axis", () => {
    const room = makeRoom();
    // half-depth 2 > room half-depth -> center on Z
    const pos = clampToRoom({ x: 2, y: 0, z: 0.2 }, 0.5, 2, room);
    expect(pos.z).toBeCloseTo((0.1 + 2.9) / 2); // 1.5
  });
});

describe("isInsideRoom", () => {
  it("is true for a contained footprint and false when it overhangs", () => {
    const room = makeRoom();
    expect(isInsideRoom(footprintRect({ x: 2, y: 0, z: 1.5 }, 0.5, 0.5), room)).toBe(true);
    expect(isInsideRoom(footprintRect({ x: 0.2, y: 0, z: 1.5 }, 0.5, 0.5), room)).toBe(false);
  });
});

describe("snapToWall", () => {
  const dims = { w: 2, d: 0.9, h: 0.8 };

  it("snaps flush against the near (minZ) wall and aligns rotation", () => {
    const room = makeRoom();
    // Place near the z=0 wall: center z small enough that the back is within 0.15m.
    // interior face at z=0.1; back must be within 0.15 -> center z <= 0.1 + 0.45 + 0.15
    const result = snapToWall({ x: 2, y: 0, z: 0.6 }, dims, room, 0.15);
    expect(result).not.toBeNull();
    // Back flush: center z = interiorFace(0.1) + halfDepth(0.45) = 0.55
    expect(result!.position.z).toBeCloseTo(0.55);
    // Interior normal for the z=0 wall points +Z -> rotationY = atan2(0,1) = 0
    expect(result!.rotationY).toBeCloseTo(0);
    // Slide position (x) preserved
    expect(result!.position.x).toBeCloseTo(2);
  });

  it("snaps against the maxX wall with a quarter-turn rotation", () => {
    const room = makeRoom();
    // near x=4 wall; interior face x=3.9, back within 0.15 -> center x >= 3.9 - 0.45 - 0.15
    const result = snapToWall({ x: 3.4, y: 0, z: 1.5 }, dims, room, 0.15);
    expect(result).not.toBeNull();
    // interior normal points -X -> center x = 3.9 - 0.45 = 3.45
    expect(result!.position.x).toBeCloseTo(3.45);
    // normal (-1, 0) -> rotationY = atan2(-1, 0) = -PI/2
    expect(result!.rotationY).toBeCloseTo(-Math.PI / 2);
  });

  it("returns null when no wall is within the threshold", () => {
    const room = makeRoom();
    const result = snapToWall({ x: 2, y: 0, z: 1.5 }, dims, room, 0.15);
    expect(result).toBeNull();
  });
});

describe("snapScalar / snapPositionToGrid", () => {
  it("snaps to the nearest multiple", () => {
    expect(snapScalar(0.37, 0.05)).toBeCloseTo(0.35);
    expect(snapScalar(0.38, 0.05)).toBeCloseTo(0.4);
  });

  it("passes through when step is non-positive", () => {
    expect(snapScalar(0.37, 0)).toBe(0.37);
  });

  it("snaps X and Z but leaves Y", () => {
    const p = snapPositionToGrid({ x: 0.37, y: 1.23, z: 0.62 }, 0.05);
    expect(p.x).toBeCloseTo(0.35);
    expect(p.z).toBeCloseTo(0.6);
    expect(p.y).toBe(1.23);
  });
});
