/**
 * Pure geometry helpers for the 2D floor-plan editor: grid/angle snapping,
 * dimension formatting, and point/segment math. No React, no DOM — kept
 * separate so it is trivially unit-testable.
 */
import type { Point2D } from "@interior/core";

/** Snap a point to the nearest grid intersection, given a grid size in meters. */
export function snapToGrid(point: Point2D, gridSize: number): Point2D {
  if (gridSize <= 0) return point;
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize
  };
}

/** Euclidean distance between two points. */
export function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Angle in degrees (0-360) of the vector from `a` to `b`, measured from +X axis. */
export function angleDeg(a: Point2D, b: Point2D): number {
  const rad = Math.atan2(b.y - a.y, b.x - a.x);
  const deg = (rad * 180) / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

/**
 * Given a fixed anchor point and a free-moving point, snap the free point so
 * that the angle from anchor->free is a multiple of `stepDeg` (default 90),
 * as long as the raw angle is within `toleranceDeg` of that multiple.
 * Distance from anchor is preserved. If no multiple is within tolerance, the
 * original point is returned unchanged.
 */
export function snapAngle(
  anchor: Point2D,
  point: Point2D,
  stepDeg = 90,
  toleranceDeg = 6
): Point2D {
  const dist = distance(anchor, point);
  if (dist === 0) return point;

  const raw = angleDeg(anchor, point);
  const nearestStep = Math.round(raw / stepDeg) * stepDeg;
  const diff = Math.abs(((raw - nearestStep + 540) % 360) - 180);

  if (diff > toleranceDeg) return point;

  const rad = (nearestStep * Math.PI) / 180;
  return {
    x: anchor.x + Math.cos(rad) * dist,
    y: anchor.y + Math.sin(rad) * dist
  };
}

/** Apply grid snap then angle snap (relative to `anchor`, if provided). */
export function snapPoint(
  point: Point2D,
  gridSize: number,
  anchor?: Point2D,
  angleSnapEnabled = true,
  stepDeg = 90
): Point2D {
  let result = snapToGrid(point, gridSize);
  if (anchor && angleSnapEnabled) {
    result = snapAngle(anchor, result, stepDeg);
    result = snapToGrid(result, gridSize);
  }
  return result;
}

/** Format a length in meters for display, e.g. 3.205 -> "3.21 m". */
export function formatMeters(value: number): string {
  return `${value.toFixed(2)} m`;
}

/** Whether `point` is within `radius` of `target` (used for close-loop / vertex hit testing). */
export function isNear(point: Point2D, target: Point2D, radius: number): boolean {
  return distance(point, target) <= radius;
}

export interface WallSegment {
  index: number;
  start: Point2D;
  end: Point2D;
  length: number;
}

/** Return the closed-polyline wall segments of a room's `walls` points. */
export function wallSegments(walls: Point2D[]): WallSegment[] {
  if (walls.length < 2) return [];
  return walls.map((start, index) => {
    const end = walls[(index + 1) % walls.length] as Point2D;
    return { index, start, end, length: distance(start, end) };
  });
}

/**
 * Project `point` onto the wall segment at `wallIndex`, returning the
 * distance along the wall (clamped to [0, wallLength]) — this is the value
 * stored as `Opening.position`.
 */
export function projectOntoWall(point: Point2D, segment: WallSegment): number {
  const { start, end, length } = segment;
  if (length === 0) return 0;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (length * length);
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * length;
}

/** World-space point at `position` meters along a wall segment. */
export function pointAlongWall(segment: WallSegment, position: number): Point2D {
  const { start, end, length } = segment;
  if (length === 0) return start;
  const t = Math.max(0, Math.min(1, position / length));
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t
  };
}

/** Signed area of a polygon (shoelace) — positive if counter-clockwise. */
export function polygonSignedArea(points: Point2D[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i] as Point2D;
    const b = points[(i + 1) % points.length] as Point2D;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Distance from a point to the nearest point on a segment, plus the t value. */
export function closestPointOnSegment(
  point: Point2D,
  segment: WallSegment
): { point: Point2D; distance: number; t: number } {
  const { start, end, length } = segment;
  if (length === 0) {
    return { point: start, distance: distance(point, start), t: 0 };
  }
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (length * length))
  );
  const proj = { x: start.x + dx * t, y: start.y + dy * t };
  return { point: proj, distance: distance(point, proj), t };
}
