/**
 * Pure placement math for furniture in the 3D tab. No three.js, no React —
 * every function here operates on plain scene-document data so it can be
 * unit-tested headlessly and reused by the interaction layer.
 *
 * Coordinate convention (matches `@interior/core` geometry helpers): a room's
 * `walls` are plan points `(x, y)` where plan-X maps to world-X and plan-Y maps
 * to world-Z. Furniture lives in world space, so a wall corner `(x, y)` sits at
 * world `(x, _, y)`. Throughout this module we treat a room corner's `.x` as X
 * and `.y` as Z.
 *
 * Orientation convention: a furniture item at `rotationY = 0` has its width
 * along local X, depth along local Z, and "front" facing local +Z. A Y-rotation
 * of θ maps local +Z to world `(sin θ, cos θ)`.
 */

import type { Dimensions3D, Room, Vector3 } from "@interior/core";
import { deriveWallSegments, polygonCentroid } from "@interior/core";

const EPS = 1e-9;

/** Axis-aligned footprint rectangle in the world XZ plane. */
export interface RectXZ {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Distances from a furniture footprint to the room's interior wall faces. */
export interface WallDistances {
  minusX: number;
  plusX: number;
  minusZ: number;
  plusZ: number;
}

/** Result of snapping a furniture item flush against a wall. */
export interface WallSnapResult {
  position: Vector3;
  rotationY: number;
  wallIndex: number;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Half-extents of a rotated w×d footprint projected onto the world axes. This
 * matches `@interior/core`'s `furnitureAABB` rotated-box logic.
 */
export function rotatedHalfExtents(
  dimensions: Dimensions3D,
  rotationY: number
): { hx: number; hz: number } {
  const halfW = dimensions.w / 2;
  const halfD = dimensions.d / 2;
  const cos = Math.abs(Math.cos(rotationY));
  const sin = Math.abs(Math.sin(rotationY));
  return {
    hx: halfW * cos + halfD * sin,
    hz: halfW * sin + halfD * cos
  };
}

/** Footprint rectangle of an item at `position` with the given half-extents. */
export function footprintRect(position: Vector3, hx: number, hz: number): RectXZ {
  return {
    minX: position.x - hx,
    maxX: position.x + hx,
    minZ: position.z - hz,
    maxZ: position.z + hz
  };
}

/** Axis-aligned bounding rectangle of a room's wall corners in world XZ. */
export function roomBounds(room: Room): RectXZ | null {
  if (room.walls.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const corner of room.walls) {
    minX = Math.min(minX, corner.x);
    maxX = Math.max(maxX, corner.x);
    minZ = Math.min(minZ, corner.y);
    maxZ = Math.max(maxZ, corner.y);
  }
  return { minX, maxX, minZ, maxZ };
}

/**
 * Interior bounds of a room: its corner bounding box inset by half the wall
 * thickness on every side, i.e. the usable floor rectangle bounded by the
 * inner wall faces. For a rectangular room this is exact; for an L-shaped room
 * it is the outer usable envelope (a reasonable MVP approximation).
 */
export function roomInteriorBounds(room: Room): RectXZ | null {
  const bounds = roomBounds(room);
  if (!bounds) return null;
  const half = room.wallThickness / 2;
  return {
    minX: bounds.minX + half,
    maxX: bounds.maxX - half,
    minZ: bounds.minZ + half,
    maxZ: bounds.maxZ - half
  };
}

/**
 * Distances from each side of a furniture footprint to the nearest interior
 * wall face along that axis. Positive means a gap; negative means the footprint
 * pokes past the wall face on that side. Used for the drag measurement overlay.
 */
export function wallDistances(rect: RectXZ, room: Room): WallDistances | null {
  const inner = roomInteriorBounds(room);
  if (!inner) return null;
  return {
    minusX: rect.minX - inner.minX,
    plusX: inner.maxX - rect.maxX,
    minusZ: rect.minZ - inner.minZ,
    plusZ: inner.maxZ - rect.maxZ
  };
}

/**
 * Clamp a furniture center so its footprint stays inside the room's interior
 * bounds. If the item is wider/deeper than the room on an axis, it is centered
 * on that axis. Returns the (possibly unchanged) position.
 */
export function clampToRoom(position: Vector3, hx: number, hz: number, room: Room): Vector3 {
  const inner = roomInteriorBounds(room);
  if (!inner) return position;

  const loX = inner.minX + hx;
  const hiX = inner.maxX - hx;
  const loZ = inner.minZ + hz;
  const hiZ = inner.maxZ - hz;

  const x = loX > hiX ? (inner.minX + inner.maxX) / 2 : clamp(position.x, loX, hiX);
  const z = loZ > hiZ ? (inner.minZ + inner.maxZ) / 2 : clamp(position.z, loZ, hiZ);

  return { x, y: position.y, z };
}

/** Whether a footprint lies fully within the room's interior bounds. */
export function isInsideRoom(rect: RectXZ, room: Room): boolean {
  const inner = roomInteriorBounds(room);
  if (!inner) return false;
  return (
    rect.minX >= inner.minX - EPS &&
    rect.maxX <= inner.maxX + EPS &&
    rect.minZ >= inner.minZ - EPS &&
    rect.maxZ <= inner.maxZ + EPS
  );
}

/**
 * If the item's back is within `threshold` meters of a wall it is alongside,
 * return a snapped pose: rotated so its back faces the wall and translated so
 * its back face sits flush against the wall's interior face. The slide position
 * along the wall is preserved. Returns `null` when no wall is close enough.
 *
 * When multiple walls qualify, the nearest one wins. The item is reoriented so
 * its DEPTH dimension faces the wall (typical for sofas, beds, wardrobes).
 */
export function snapToWall(
  position: Vector3,
  dimensions: Dimensions3D,
  room: Room,
  threshold = 0.15
): WallSnapResult | null {
  const segments = deriveWallSegments(room.walls);
  if (segments.length === 0) return null;
  const centroid = polygonCentroid(room.walls);
  const half = room.wallThickness / 2;
  const halfDepth = dimensions.d / 2;

  const cx = position.x;
  const cz = position.z;

  let best: (WallSnapResult & { gap: number }) | null = null;

  for (const seg of segments) {
    if (seg.length < EPS) continue;

    // Interior normal: flip the geometric normal so it points toward the room
    // centroid (into the room).
    let nx = seg.normal.x;
    let nz = seg.normal.y;
    if ((centroid.x - seg.start.x) * nx + (centroid.y - seg.start.y) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }

    const dirX = seg.dir.x;
    const dirZ = seg.dir.y;
    const relX = cx - seg.start.x;
    const relZ = cz - seg.start.y;

    // Perpendicular distance from wall centerline (interior side positive) and
    // slide position along the wall.
    const perp = relX * nx + relZ * nz;
    if (perp <= 0) continue; // center is on the far/outside of this wall
    const tang = relX * dirX + relZ * dirZ;
    if (tang < -threshold || tang > seg.length + threshold) continue; // not alongside

    // Gap between the item's back face and the wall's interior face.
    const gap = perp - half - halfDepth;
    if (Math.abs(gap) > threshold) continue;

    if (!best || Math.abs(gap) < Math.abs(best.gap)) {
      const rotationY = Math.atan2(nx, nz); // local +Z aligned with interior normal
      const targetPerp = half + halfDepth;
      const snappedTang = clamp(tang, halfDepth, Math.max(halfDepth, seg.length - halfDepth));
      const px = seg.start.x + dirX * snappedTang + nx * targetPerp;
      const pz = seg.start.y + dirZ * snappedTang + nz * targetPerp;
      best = {
        gap,
        position: { x: px, y: position.y, z: pz },
        rotationY,
        wallIndex: seg.index
      };
    }
  }

  if (!best) return null;
  return { position: best.position, rotationY: best.rotationY, wallIndex: best.wallIndex };
}

/** Snap a scalar to the nearest multiple of `step` (0 or negative = no snap). */
export function snapScalar(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

/** Grid-snap a world XZ position (Y untouched). */
export function snapPositionToGrid(position: Vector3, step: number): Vector3 {
  return {
    x: snapScalar(position.x, step),
    y: position.y,
    z: snapScalar(position.z, step)
  };
}
