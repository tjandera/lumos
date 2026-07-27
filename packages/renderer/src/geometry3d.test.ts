import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { polygonAbsArea } from "@interior/core";
import type { Opening, Room } from "@interior/core";
import {
  buildFloorGeometry,
  buildRoomWallGeometries,
  buildWallGeometry,
  buildWallShape,
  localOpeningRects
} from "./geometry3d.js";
import { wallSegments } from "@interior/core";

const RECT = [
  { x: 0, z: 0 },
  { x: 4, z: 0 },
  { x: 4, z: 3 },
  { x: 0, z: 3 }
];

function wallsFromCorners(corners: { x: number; z: number }[], thickness = 0.2, height = 2.5) {
  return corners.map((point, index) => {
    const next = corners[(index + 1) % corners.length]!;
    return {
      id: `w${index}`,
      start: { x: point.x, z: point.z },
      end: { x: next.x, z: next.z },
      thickness,
      height
    };
  });
}

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "room-1",
    name: "Test",
    walls: wallsFromCorners(RECT),
    materials: {
      wall: { color: "#efeae2", finish: "matte" },
      floor: { color: "#d9d2c7", finish: "matte" },
      ceiling: { color: "#f5f2ea", finish: "matte" }
    },
    ...overrides
  };
}

/** Sum of triangle areas projected onto the XZ (floor) plane. */
function floorArea(geometry: THREE.BufferGeometry): number {
  const pos = geometry.getAttribute("position");
  let area = 0;
  for (let i = 0; i < pos.count; i += 3) {
    const ax = pos.getX(i);
    const az = pos.getZ(i);
    const bx = pos.getX(i + 1);
    const bz = pos.getZ(i + 1);
    const cx = pos.getX(i + 2);
    const cz = pos.getZ(i + 2);
    area += Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
  }
  return area;
}

/** Average vertex normal, to check overall orientation. */
function averageNormal(geometry: THREE.BufferGeometry): THREE.Vector3 {
  const n = geometry.getAttribute("normal");
  const acc = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) acc.add(new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i)));
  return acc.divideScalar(n.count);
}

describe("localOpeningRects", () => {
  it("keeps only openings for the given wall with positive extent", () => {
    const openings: Opening[] = [
      { id: "a", wallId: "w0", kind: "window", offset: 2, width: 1, height: 1, sillHeight: 1, glassTint: 0.06, covering: { type: "none", state: "open" } },
      { id: "b", wallId: "w1", kind: "door", offset: 1, width: 0.9, height: 2, sillHeight: 0, glassTint: 0.06, covering: { type: "none", state: "open" } }
    ];
    // v6 semantics (schema.ts): `offset` is the LEFT edge of the opening measured
    // from the wall's start, not its center — see openingSpan() in core/geometry.ts,
    // the single source of truth every consumer of `offset` must agree with.
    const rects = localOpeningRects(openings, "w0", 4, 2.5);
    expect(rects).toHaveLength(1);
    expect(rects[0]!.id).toBe("a");
    expect(rects[0]!.u0).toBeCloseTo(2); // offset
    expect(rects[0]!.u1).toBeCloseTo(3); // offset + width
    expect(rects[0]!.v0).toBeCloseTo(1);
    expect(rects[0]!.v1).toBeCloseTo(2);
  });

  it("clamps openings to the wall extent", () => {
    const openings: Opening[] = [
      // offset 3.5 + width 1 = right edge at 4.5, past the 4m wall — clamp u1 to 4.
      { id: "a", wallId: "w0", kind: "window", offset: 3.5, width: 1, height: 5, sillHeight: 0.5, glassTint: 0.06, covering: { type: "none", state: "open" } }
    ];
    const rects = localOpeningRects(openings, "w0", 4, 2.5);
    expect(rects[0]!.u0).toBeCloseTo(3.5); // offset, unclamped — within the wall
    expect(rects[0]!.u1).toBeCloseTo(4); // offset + width (4.5) clamped to wall length
    expect(rects[0]!.v1).toBeCloseTo(2.5); // 0.5 + 5 clamped to wall height
  });
});

describe("buildWallShape", () => {
  it("cuts a raised window as a hole with the expected bounds", () => {
    const shape = buildWallShape(4, 2.5, [
      { id: "w", kind: "window", u0: 1.5, u1: 2.5, v0: 1, v1: 2 }
    ]);
    expect(shape.holes).toHaveLength(1);
    const box = new THREE.Box2().setFromPoints(shape.holes[0]!.getPoints());
    expect(box.min.x).toBeCloseTo(1.5);
    expect(box.max.x).toBeCloseTo(2.5);
    expect(box.min.y).toBeCloseTo(1);
    expect(box.max.y).toBeCloseTo(2);
  });

  it("routes a floor-level door as a bottom notch, not a hole", () => {
    const shape = buildWallShape(4, 2.5, [
      { id: "d", kind: "door", u0: 1, u1: 1.9, v0: 0, v1: 2.1 }
    ]);
    expect(shape.holes).toHaveLength(0);
    // The contour must dip up to the door top somewhere along the bottom.
    const pts = shape.getPoints();
    const hasNotchTop = pts.some((p) => Math.abs(p.x - 1) < 1e-6 && Math.abs(p.y - 2.1) < 1e-6);
    expect(hasNotchTop).toBe(true);
  });
});

describe("buildRoomWallGeometries", () => {
  it("produces one wall geometry per segment", () => {
    const geoms = buildRoomWallGeometries(makeRoom(), []);
    expect(geoms).toHaveLength(4);
  });

  it("each wall geometry has non-empty positions and normals", () => {
    const geoms = buildRoomWallGeometries(makeRoom(), []);
    for (const g of geoms) {
      expect(g.getAttribute("position").count).toBeGreaterThan(0);
      expect(g.getAttribute("normal").count).toBe(g.getAttribute("position").count);
      expect(g.getAttribute("uv")).toBeDefined();
    }
  });
});

describe("buildWallGeometry", () => {
  it("spans the wall length, thickness, and height in world space", () => {
    const seg = wallSegments(makeRoom())[0]!; // (0,0)->(4,0) along +X, normal along Z
    const geom = buildWallGeometry(seg, 2.5, 0.2, []);
    const box = geom.boundingBox!;
    expect(box.min.x).toBeCloseTo(0);
    expect(box.max.x).toBeCloseTo(4);
    expect(box.min.y).toBeCloseTo(0);
    expect(box.max.y).toBeCloseTo(2.5);
    // thickness centered on the polyline (z = 0) -> +/- 0.1
    expect(box.min.z).toBeCloseTo(-0.1);
    expect(box.max.z).toBeCloseTo(0.1);
  });

  it("removes volume when an opening is cut (window reduces area vs solid)", () => {
    const seg = wallSegments(makeRoom())[0]!;
    const solid = buildWallGeometry(seg, 2.5, 0.2, []);
    const withWindow = buildWallGeometry(seg, 2.5, 0.2, [
      { id: "w", wallId: seg.wall.id, kind: "window", offset: 2, width: 1, height: 1, sillHeight: 1, glassTint: 0.06, covering: { type: "none", state: "open" } }
    ]);
    // The windowed wall's front face has less area; compare vertex counts as a
    // proxy that extra hole geometry was generated.
    expect(withWindow.getAttribute("position").count).toBeGreaterThan(
      solid.getAttribute("position").count
    );
  });
});

describe("buildFloorGeometry", () => {
  it("triangulated area matches the rectangle polygon area", () => {
    const geom = buildFloorGeometry(makeRoom());
    expect(floorArea(geom)).toBeCloseTo(polygonAbsArea(RECT));
  });

  it("faces up (+Y)", () => {
    const geom = buildFloorGeometry(makeRoom());
    expect(averageNormal(geom).y).toBeCloseTo(1);
  });

  it("triangulated area matches a CONCAVE (L-shaped) polygon", () => {
    const lShape = [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 2 },
      { x: 2, z: 2 },
      { x: 2, z: 4 },
      { x: 0, z: 4 }
    ];
    const geom = buildFloorGeometry(makeRoom({ walls: wallsFromCorners(lShape) }));
    expect(floorArea(geom)).toBeCloseTo(polygonAbsArea(lShape));
    expect(floorArea(geom)).toBeCloseTo(12);
    expect(averageNormal(geom).y).toBeCloseTo(1);
  });

  it("faces up regardless of polygon winding", () => {
    const cw = buildFloorGeometry(makeRoom({ walls: wallsFromCorners([...RECT].reverse()) }));
    expect(averageNormal(cw).y).toBeCloseTo(1);
    expect(floorArea(cw)).toBeCloseTo(12);
  });

  it("returns empty geometry for a degenerate polygon", () => {
    const geom = buildFloorGeometry(makeRoom({ walls: wallsFromCorners([{ x: 0, z: 0 }, { x: 1, z: 1 }]) }));
    expect(geom.getAttribute("position")).toBeUndefined();
  });
});
