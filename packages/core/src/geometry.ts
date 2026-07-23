/**
 * Pure 2D geometry helpers for the scene document. No three.js dependency —
 * these operate purely on the plain `Point2D` / `Room` data so they can be
 * shared by the renderer, the plan editor, the API, and the AI tool layer,
 * and unit-tested without a GL context.
 *
 * Coordinate convention: the floor plan lives in the XY plane (`Point2D`).
 * The renderer maps a plan point `(x, y)` to the 3D world point `(x, up, y)`,
 * i.e. plan-X -> world-X and plan-Y -> world-Z, with world-Y pointing up.
 */

import type { Opening, Point2D, Room } from "./types.js";

const EPS = 1e-9;

/**
 * A straight wall segment derived from consecutive corners of a room's closed
 * wall polyline. `index` matches the `Opening.wallIndex` convention: segment
 * `i` runs from `walls[i]` to `walls[i + 1]`, wrapping so the final segment
 * runs from `walls[n - 1]` back to `walls[0]`.
 */
export interface WallSegment {
  index: number;
  start: Point2D;
  end: Point2D;
  /** Euclidean length of the segment in meters. */
  length: number;
  /** Unit vector pointing from `start` to `end`. Zero vector for a degenerate segment. */
  dir: Point2D;
  /**
   * Unit normal, 90 degrees clockwise from `dir` (i.e. `(dir.y, -dir.x)`).
   * Which physical side of the wall this points to depends on the polygon
   * winding; use `polygonArea` if you need to disambiguate inside/outside.
   */
  normal: Point2D;
  /** Direction angle `atan2(dir.y, dir.x)` in radians. */
  angle: number;
}

/**
 * Derive the closed loop of wall segments from a room's corner polyline.
 * Returns one segment per edge including the closing edge. Fewer than two
 * distinct corners yields an empty array (no walls can be formed).
 */
export function deriveWallSegments(walls: Point2D[]): WallSegment[] {
  const n = walls.length;
  if (n < 2) return [];

  const segments: WallSegment[] = [];
  for (let i = 0; i < n; i++) {
    const start = walls[i] as Point2D;
    const end = walls[(i + 1) % n] as Point2D;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    const dir: Point2D = length > EPS ? { x: dx / length, y: dy / length } : { x: 0, y: 0 };
    const normal: Point2D = { x: dir.y, y: -dir.x };
    segments.push({
      index: i,
      start,
      end,
      length,
      dir,
      normal,
      angle: Math.atan2(dy, dx)
    });
  }
  return segments;
}

/**
 * Signed area of a polygon via the shoelace formula. Positive result means the
 * points wind counter-clockwise in standard (x-right, y-up) axes; negative
 * means clockwise. Magnitude is the enclosed area in square meters.
 */
export function polygonArea(points: Point2D[]): number {
  const n = points.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i] as Point2D;
    const b = points[(i + 1) % n] as Point2D;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Absolute enclosed area of a polygon in square meters. */
export function polygonAbsArea(points: Point2D[]): number {
  return Math.abs(polygonArea(points));
}

/** Whether the polygon's corners wind clockwise in standard (y-up) axes. */
export function isClockwise(points: Point2D[]): boolean {
  return polygonArea(points) < 0;
}

/**
 * Area-weighted centroid of a simple polygon. Falls back to the average of the
 * corners for a degenerate (zero-area) polygon.
 */
export function polygonCentroid(points: Point2D[]): Point2D {
  const n = points.length;
  if (n === 0) return { x: 0, y: 0 };
  const area = polygonArea(points);
  if (Math.abs(area) < EPS) {
    const avg = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: avg.x / n, y: avg.y / n };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i] as Point2D;
    const b = points[(i + 1) % n] as Point2D;
    const cross = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  const factor = 1 / (6 * area);
  return { x: cx * factor, y: cy * factor };
}

/**
 * Point at a given distance from the start of a wall segment, measured along
 * the segment direction. The distance is not clamped; callers that need to
 * stay on the physical wall should clamp to `[0, segment.length]`.
 */
export function pointAlongWall(segment: WallSegment, distance: number): Point2D {
  return {
    x: segment.start.x + segment.dir.x * distance,
    y: segment.start.y + segment.dir.y * distance
  };
}

/**
 * The `[start, end]` distances of an opening along its wall segment, derived
 * from its centered `position` and `width`. `position` is interpreted as the
 * distance from the wall start to the CENTER of the opening.
 */
export function openingSpan(opening: Opening): { start: number; end: number } {
  const half = opening.width / 2;
  return { start: opening.position - half, end: opening.position + half };
}

/**
 * World-plane (2D) center point of an opening, resolved against its room's
 * wall polyline. Returns `null` if the opening references a wall index that
 * does not exist.
 */
export function openingCenter(room: Room, opening: Opening): Point2D | null {
  const segments = deriveWallSegments(room.walls);
  const segment = segments[opening.wallIndex];
  if (!segment) return null;
  return pointAlongWall(segment, opening.position);
}

/**
 * Whether an opening fits within its wall segment: it must reference a valid
 * wall, have positive width, and lie fully between the wall's endpoints.
 */
export function openingFitsWall(room: Room, opening: Opening): boolean {
  const segments = deriveWallSegments(room.walls);
  const segment = segments[opening.wallIndex];
  if (!segment) return false;
  if (opening.width <= 0) return false;
  const { start, end } = openingSpan(opening);
  return start >= -EPS && end <= segment.length + EPS;
}
