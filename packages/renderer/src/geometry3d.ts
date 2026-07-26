/**
 * Pure geometry construction for rooms. These functions build `three`
 * BufferGeometries from the plain scene-document data and are deliberately
 * free of any GL / React / react-three-fiber dependency, so they can be
 * unit-tested headlessly (three's geometry math runs fine in plain Node).
 *
 * Coordinate convention (matches `@interior/core` geometry helpers): a plan
 * point `(x, y)` maps to the world point `(x, up, y)` — plan-X -> world-X,
 * plan-Y -> world-Z, world-Y up. The floor sits at y = 0, the ceiling at
 * y = room.height.
 *
 * Opening strategy: openings are cut into each wall face as part of the 2D
 * `THREE.Shape` that is then extruded through the wall thickness. Windows
 * (sill height > 0) become rectangular HOLES in the shape; doors / floor-level
 * openings become a NOTCH routed into the bottom contour of the wall. This
 * "shape-with-holes + extrude" route is chosen over CSG because:
 *   - openings here are axis-aligned rectangles on a flat face, which earcut
 *     (via ExtrudeGeometry) triangulates exactly and deterministically;
 *   - ExtrudeGeometry generates the inner reveal faces through the wall
 *     thickness for free, so the opening looks solid from every angle;
 *   - it adds no heavy/nondeterministic dependency (three-bvh-csg) and stays
 *     trivially unit-testable without a GL context.
 * Routing doors as a bottom notch (rather than a hole touching the boundary)
 * avoids the degenerate near-boundary triangles that a boundary-touching hole
 * would produce.
 */

import * as THREE from "three";
import type { Opening, Room } from "@interior/core";
import { deriveWallSegments, openingSpan, polygonArea, type WallSegment } from "@interior/core";

const EPS = 1e-6;

/** A rectangular opening expressed in a wall's local face frame (u along the
 *  wall from its start, v upward from the floor). */
export interface LocalOpeningRect {
  id: string;
  type: Opening["type"];
  /** left edge distance along the wall */
  u0: number;
  /** right edge distance along the wall */
  u1: number;
  /** bottom edge height */
  v0: number;
  /** top edge height */
  v1: number;
}

/**
 * Project a room's openings for a single wall into that wall's local face
 * frame, clamped to the wall extent. Only openings whose `wallIndex` matches
 * and that have positive width are returned.
 */
export function localOpeningRects(
  openings: Opening[],
  wallIndex: number,
  wallLength: number,
  wallHeight: number
): LocalOpeningRect[] {
  const rects: LocalOpeningRect[] = [];
  for (const opening of openings) {
    if (opening.wallIndex !== wallIndex) continue;
    if (opening.width <= 0 || opening.height <= 0) continue;
    const span = openingSpan(opening);
    const u0 = Math.max(0, Math.min(wallLength, span.start));
    const u1 = Math.max(0, Math.min(wallLength, span.end));
    if (u1 - u0 <= EPS) continue;
    const v0 = Math.max(0, opening.sillHeight);
    const v1 = Math.min(wallHeight, opening.sillHeight + opening.height);
    if (v1 - v0 <= EPS) continue;
    rects.push({ id: opening.id, type: opening.type, u0, u1, v0, v1 });
  }
  return rects;
}

/**
 * Build the 2D face outline of a wall (length x height) with its openings cut
 * out. Floor-level openings (v0 ~ 0) are routed as a bottom notch in the outer
 * contour; raised openings become rectangular holes. Returns a `THREE.Shape`
 * in the wall's local (u, v) frame ready to be extruded through the thickness.
 */
export function buildWallShape(
  length: number,
  height: number,
  rects: LocalOpeningRect[]
): THREE.Shape {
  const notches = rects
    .filter((r) => r.v0 <= EPS)
    .sort((a, b) => a.u0 - b.u0);
  const holes = rects.filter((r) => r.v0 > EPS);

  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  // Bottom edge, left -> right, dipping up around each floor-level notch.
  for (const n of notches) {
    const top = Math.min(n.v1, height - EPS);
    shape.lineTo(n.u0, 0);
    shape.lineTo(n.u0, top);
    shape.lineTo(n.u1, top);
    shape.lineTo(n.u1, 0);
  }
  shape.lineTo(length, 0);
  shape.lineTo(length, height);
  shape.lineTo(0, height);
  shape.lineTo(0, 0);

  for (const h of holes) {
    const path = new THREE.Path();
    path.moveTo(h.u0, h.v0);
    path.lineTo(h.u1, h.v0);
    path.lineTo(h.u1, h.v1);
    path.lineTo(h.u0, h.v1);
    path.lineTo(h.u0, h.v0);
    shape.holes.push(path);
  }
  return shape;
}

/**
 * Basis that maps a wall's local extrude frame to world space:
 *   local +X -> along the wall (start -> end)
 *   local +Y -> world up
 *   local +Z -> wall normal (right-handed, det = +1 so winding/normals hold)
 * The extrusion is centered on the wall polyline by offsetting half the
 * thickness along the normal.
 */
function wallLocalToWorld(segment: WallSegment): THREE.Matrix4 {
  const u = new THREE.Vector3(segment.dir.x, 0, segment.dir.y);
  const up = new THREE.Vector3(0, 1, 0);
  // Right-handed: w = u x up.
  const w = new THREE.Vector3().crossVectors(u, up).normalize();
  const basis = new THREE.Matrix4().makeBasis(u, up, w);
  const origin = new THREE.Vector3(segment.start.x, 0, segment.start.y);
  return new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z).multiply(basis);
}

/**
 * Build the extruded 3D geometry for a single wall segment, with its openings
 * cut out, already transformed into world space. Normals and UVs come from
 * `ExtrudeGeometry`; walls are meant to be rendered double-sided so the
 * interior faces are visible.
 */
export function buildWallGeometry(
  segment: WallSegment,
  height: number,
  thickness: number,
  openings: Opening[]
): THREE.BufferGeometry {
  const rects = localOpeningRects(openings, segment.index, segment.length, height);
  const shape = buildWallShape(segment.length, height, rects);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    steps: 1
  });
  // Center the wall on its polyline, then rotate/translate into world space.
  geometry.translate(0, 0, -thickness / 2);
  geometry.applyMatrix4(wallLocalToWorld(segment));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Build one wall geometry per room wall segment. */
export function buildRoomWallGeometries(room: Room): THREE.BufferGeometry[] {
  return deriveWallSegments(room.walls).map((segment) =>
    buildWallGeometry(segment, room.height, room.wallThickness, room.openings)
  );
}

/**
 * Triangulate the room polygon into a flat floor geometry at y = 0. Uses
 * earcut via `THREE.ShapeUtils.triangulateShape`, which handles concave
 * polygons. Vertex normals are set straight up (+Y) and winding is chosen so
 * the front face points up regardless of the input polygon's winding.
 */
export function buildFloorGeometry(room: Room): THREE.BufferGeometry {
  const pts = room.walls;
  const geometry = new THREE.BufferGeometry();
  if (pts.length < 3) return geometry;

  const contour = pts.map((p) => new THREE.Vector2(p.x, p.y));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  // Front face up (+Y). When plan-Y maps to world-Z, a counter-clockwise plan
  // polygon triangulates to triangles that face DOWN, so flip for CCW input.
  const flip = polygonArea(pts) > 0;

  for (const face of faces) {
    const [a, b, c] = flip ? [face[2]!, face[1]!, face[0]!] : [face[0]!, face[1]!, face[2]!];
    for (const idx of [a, b, c]) {
      const p = pts[idx]!;
      positions.push(p.x, 0, p.y);
      normals.push(0, 1, 0);
      uvs.push(p.x, p.y);
    }
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Convenience bundle of every geometry needed to render a room. */
export interface RoomGeometries {
  walls: THREE.BufferGeometry[];
  floor: THREE.BufferGeometry;
}

export function buildRoomGeometries(room: Room): RoomGeometries {
  return {
    walls: buildRoomWallGeometries(room),
    floor: buildFloorGeometry(room)
  };
}
