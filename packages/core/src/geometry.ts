/**
 * Pure 2D geometry helpers for the scene document. No three.js dependency — these
 * operate on plain document data so they can be shared by the renderer, the plan
 * editor, the API and the AI tool layer, and unit-tested without a GL context.
 *
 * Coordinate convention: the floor plan lives on the world X/Z plane (`Vec2` is
 * `{ x, z }`), with world-Y pointing up. See units.ts.
 *
 * Walls are stored as explicit segments (each with its own thickness and height),
 * so unlike a corner-polyline model there's nothing to "derive" — but the polygon
 * helpers below still need the room's corner loop, which `roomCorners` recovers.
 */

import type { Opening, Room, Vec2, Wall } from './schema.js';

const EPS = 1e-9;

/** Build the 4 walls of a w×d rectangular room centered at the origin. */
export function rectWalls(w: number, d: number, height: number, thickness: number): Wall[] {
  const hw = w / 2;
  const hd = d / 2;
  return [
    { id: 'wall-N', start: { x: -hw, z: -hd }, end: { x: hw, z: -hd }, thickness, height },
    { id: 'wall-S', start: { x: -hw, z: hd }, end: { x: hw, z: hd }, thickness, height },
    { id: 'wall-W', start: { x: -hw, z: -hd }, end: { x: -hw, z: hd }, thickness, height },
    { id: 'wall-E', start: { x: hw, z: -hd }, end: { x: hw, z: hd }, thickness, height },
  ];
}

/** A wall segment with its derived metrics, for code that needs direction/normal/length. */
export interface WallSegment {
  wall: Wall;
  length: number;
  /** Unit vector from `start` to `end`. Zero vector for a degenerate wall. */
  dir: Vec2;
  /** Unit normal, 90° clockwise from `dir`. Which physical side it points to depends on
   * the room's winding — use `polygonArea` on `roomCorners` to disambiguate. */
  normal: Vec2;
  /** Direction angle `atan2(dz, dx)` in radians. */
  angle: number;
}

export function wallSegment(wall: Wall): WallSegment {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const length = Math.hypot(dx, dz);
  const dir: Vec2 = length > EPS ? { x: dx / length, z: dz / length } : { x: 0, z: 0 };
  return { wall, length, dir, normal: { x: dir.z, z: -dir.x }, angle: Math.atan2(dz, dx) };
}

export function wallSegments(room: Room): WallSegment[] {
  return room.walls.map(wallSegment);
}

export function wallLength(wall: Wall): number {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
}

/**
 * Recover the room's corner loop from its wall segments, for the polygon helpers.
 * Walls are stored as independent segments, so this walks them start→end and only
 * emits a corner when it actually moves — a room whose walls don't form a closed
 * loop still yields its distinct corners rather than throwing.
 */
export function roomCorners(room: Room): Vec2[] {
  const corners: Vec2[] = [];
  const same = (a: Vec2, b: Vec2) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;
  for (const w of room.walls) {
    if (!corners.length || !same(corners[corners.length - 1]!, w.start)) corners.push(w.start);
    if (!same(corners[corners.length - 1]!, w.end)) corners.push(w.end);
  }
  // Drop the duplicate closing corner if the loop came back to where it started.
  if (corners.length > 1 && same(corners[0]!, corners[corners.length - 1]!)) corners.pop();
  return corners;
}

/**
 * Signed area via the shoelace formula. Positive winds counter-clockwise in
 * (x-right, z-down) axes; magnitude is the enclosed area in square meters.
 */
export function polygonArea(points: Vec2[]): number {
  const n = points.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
}

export function polygonAbsArea(points: Vec2[]): number {
  return Math.abs(polygonArea(points));
}

export function isClockwise(points: Vec2[]): boolean {
  return polygonArea(points) < 0;
}

export function polygonCentroid(points: Vec2[]): Vec2 {
  const n = points.length;
  if (n === 0) return { x: 0, z: 0 };
  if (n < 3) {
    const sx = points.reduce((s, p) => s + p.x, 0);
    const sz = points.reduce((s, p) => s + p.z, 0);
    return { x: sx / n, z: sz / n };
  }
  let cx = 0;
  let cz = 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    const cross = a.x * b.z - b.x * a.z;
    area += cross;
    cx += (a.x + b.x) * cross;
    cz += (a.z + b.z) * cross;
  }
  area /= 2;
  // Degenerate (zero-area) polygon: fall back to the average of the corners.
  if (Math.abs(area) < EPS) {
    const sx = points.reduce((s, p) => s + p.x, 0);
    const sz = points.reduce((s, p) => s + p.z, 0);
    return { x: sx / n, z: sz / n };
  }
  return { x: cx / (6 * area), z: cz / (6 * area) };
}

/** Is a plan point inside the room's footprint? Ray-cast parity test. */
export function pointInPolygon(point: Vec2, points: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    const straddles = a.z > point.z !== b.z > point.z;
    if (straddles && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** A point `distance` meters along a wall from its start. */
export function pointAlongWall(wall: Wall, distance: number): Vec2 {
  const { dir } = wallSegment(wall);
  return { x: wall.start.x + dir.x * distance, z: wall.start.z + dir.z * distance };
}

/** The span an opening occupies along its host wall, as distances from the wall start. */
export function openingSpan(opening: Opening): { start: number; end: number } {
  return { start: opening.offset, end: opening.offset + opening.width };
}

/** Plan-space midpoint of an opening, or null if its host wall isn't in this room. */
export function openingCenter(room: Room, opening: Opening): Vec2 | null {
  const wall = room.walls.find((w) => w.id === opening.wallId);
  if (!wall) return null;
  return pointAlongWall(wall, opening.offset + opening.width / 2);
}

/** Does the opening fit within its host wall's length? */
export function openingFitsWall(room: Room, opening: Opening): boolean {
  const wall = room.walls.find((w) => w.id === opening.wallId);
  if (!wall) return false;
  const { end } = openingSpan(opening);
  return opening.offset >= -EPS && end <= wallLength(wall) + EPS;
}
