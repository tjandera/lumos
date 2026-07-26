import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { polygonAbsArea } from "@interior/core";
import type { Opening, Point2D, Room } from "@interior/core";
import {
  buildFloorGeometry,
  buildRoomWallGeometries,
  buildWallGeometry,
  buildWallShape,
  localOpeningRects
} from "./geometry3d.js";
import { deriveWallSegments } from "@interior/core";

const RECT: Point2D[] = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 3 },
  { x: 0, y: 3 }
];

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "room-1",
    name: "Test",
    walls: RECT,
    wallThickness: 0.2,
    height: 2.5,
    openings: [],
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
      { id: "a", type: "window", wallIndex: 0, position: 2, width: 1, height: 1, sillHeight: 1 },
      { id: "b", type: "door", wallIndex: 1, position: 1, width: 0.9, height: 2, sillHeight: 0 }
    ];
    const rects = localOpeningRects(openings, 0, 4, 2.5);
    expect(rects).toHaveLength(1);
    expect(rects[0]!.id).toBe("a");
    expect(rects[0]!.u0).toBeCloseTo(1.5);
    expect(rects[0]!.u1).toBeCloseTo(2.5);
    expect(rects[0]!.v0).toBeCloseTo(1);
    expect(rects[0]!.v1).toBeCloseTo(2);
  });

  it("clamps openings to the wall extent", () => {
    const openings: Opening[] = [
      { id: "a", type: "window", wallIndex: 0, position: 0.2, width: 1, height: 5, sillHeight: 0.5 }
    ];
    const rects = localOpeningRects(openings, 0, 4, 2.5);
    expect(rects[0]!.u0).toBeCloseTo(0); // 0.2 - 0.5 clamped to 0
    expect(rects[0]!.v1).toBeCloseTo(2.5); // 0.5 + 5 clamped to wall height
  });
});

describe("buildWallShape", () => {
  it("cuts a raised window as a hole with the expected bounds", () => {
    const shape = buildWallShape(4, 2.5, [
      { id: "w", type: "window", u0: 1.5, u1: 2.5, v0: 1, v1: 2 }
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
      { id: "d", type: "door", u0: 1, u1: 1.9, v0: 0, v1: 2.1 }
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
    const geoms = buildRoomWallGeometries(makeRoom());
    expect(geoms).toHaveLength(4);
  });

  it("each wall geometry has non-empty positions and normals", () => {
    const geoms = buildRoomWallGeometries(makeRoom());
    for (const g of geoms) {
      expect(g.getAttribute("position").count).toBeGreaterThan(0);
      expect(g.getAttribute("normal").count).toBe(g.getAttribute("position").count);
      expect(g.getAttribute("uv")).toBeDefined();
    }
  });
});

describe("buildWallGeometry", () => {
  it("spans the wall length, thickness, and height in world space", () => {
    const seg = deriveWallSegments(RECT)[0]!; // (0,0)->(4,0) along +X, normal along Z
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
    const seg = deriveWallSegments(RECT)[0]!;
    const solid = buildWallGeometry(seg, 2.5, 0.2, []);
    const withWindow = buildWallGeometry(seg, 2.5, 0.2, [
      { id: "w", type: "window", wallIndex: 0, position: 2, width: 1, height: 1, sillHeight: 1 }
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
    const lShape: Point2D[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 4 },
      { x: 0, y: 4 }
    ];
    const geom = buildFloorGeometry(makeRoom({ walls: lShape }));
    expect(floorArea(geom)).toBeCloseTo(polygonAbsArea(lShape));
    expect(floorArea(geom)).toBeCloseTo(12);
    expect(averageNormal(geom).y).toBeCloseTo(1);
  });

  it("faces up regardless of polygon winding", () => {
    const cw = buildFloorGeometry(makeRoom({ walls: [...RECT].reverse() }));
    expect(averageNormal(cw).y).toBeCloseTo(1);
    expect(floorArea(cw)).toBeCloseTo(12);
  });

  it("returns empty geometry for a degenerate polygon", () => {
    const geom = buildFloorGeometry(makeRoom({ walls: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }));
    expect(geom.getAttribute("position")).toBeUndefined();
  });
});
