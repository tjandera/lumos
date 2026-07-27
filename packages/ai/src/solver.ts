/**
 * Deterministic layout solver.
 *
 * The LLM proposes CONSTRAINTS; this module turns them into validated
 * positions. It never trusts raw coordinates and never emits an invalid
 * placement: a request either yields a position satisfying every HARD
 * constraint (inside the room, no collision, clearance respected, door swing
 * kept clear) or a structured failure explaining why.
 *
 * Determinism: candidates are generated in a fixed order, scored by soft
 * preferences, and the best is chosen with a stable index tie-break. The same
 * document + requests always produce byte-identical output — no randomness, no
 * clock, no iteration-order surprises. This is what makes the package testable
 * as the QA surface for Phase 4.
 *
 * Coordinate mapping (see core/geometry.ts): the room's wall polyline lives in
 * the plan XY plane; plan-X -> world-X and plan-Y -> world-Z. So a wall point
 * `(x, y)` is the world floor point `(x, z=y)`. Furniture `position.y` is the
 * floor height (0 for floor-standing items).
 */

import {
  aabbIntersects,
  furnitureAABB,
  polygonCentroid,
  pointAlongWall,
  roomCorners,
  wallSegments,
  type AABB,
  type FurnitureInstance as FurnitureItem,
  type Dimensions3D,
  type Opening,
  type Room,
  type SceneDocument,
  type Vec3
} from "@interior/core";
import { needsFrontClearance } from "./catalog.js";

/** Default walkway kept in front of seating/beds/doors, in meters. */
export const DEFAULT_CLEARANCE = 0.6;

/** Grid spacing (m) for interior candidate positions. */
const GRID_STEP = 0.3;
/** Step (m) between wall-flush candidate positions along a wall. */
const WALL_STEP = 0.25;
/** Small air gap (m) left between an item and a wall face. */
const WALL_GAP = 0.02;

/** Placement zone. Re-exported publicly from `tools.ts` (same union); kept
 * internal here to avoid a duplicate export of the `Zone` name. */
type Zone = "corner" | "center" | "window";

export interface SolverConstraints {
  nearWall?: boolean;
  facingItem?: string;
  adjacentTo?: string;
  zone?: Zone;
  minClearance?: number;
  towardWall?: boolean;
  rotateDeg?: number;
}

export interface PlacementRequest {
  /** Catalog id this placement is for (informational for the solver). */
  catalogId: string;
  /** Id to assign the placed item (new) or the id of the item being moved. */
  itemId: string;
  dimensions: Dimensions3D;
  /** Category, used to decide whether front clearance is enforced. */
  category?: string;
  constraints: SolverConstraints;
  /**
   * True when `itemId` refers to an item already in the document (a move):
   * its own current footprint is excluded from collision checks.
   */
  isExisting?: boolean;
}

export interface SolvedPlacement {
  itemId: string;
  catalogId: string;
  position: Vec3;
  rotationY: number;
  dimensions: Dimensions3D;
}

export type FailureReason =
  | "no-room"
  | "item-not-found"
  | "too-big"
  | "no-space"
  | "no-clearance"
  | "unsatisfiable-constraint";

export interface PlacementFailure {
  itemId: string;
  catalogId: string;
  reason: FailureReason;
  message: string;
}

export interface SolveResult {
  placed: SolvedPlacement[];
  failed: PlacementFailure[];
}

interface Vec2 {
  x: number;
  z: number;
}

interface Candidate {
  center: Vec2;
  rotationY: number;
  /** Generation order index — the deterministic tie-break key. */
  order: number;
}

// ---------------------------------------------------------------------------
// 2D geometry helpers (world XZ plane)
// ---------------------------------------------------------------------------

/** Room wall polyline as XZ points (plan-Y maps to world-Z). */
function roomPolygon(room: Room): Vec2[] {
  return roomCorners(room).map((p) => ({ x: p.x, z: p.z }));
}

/** Standard even-odd ray-cast point-in-polygon test. */
function pointInPolygon(poly: Vec2[], p: Vec2): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = poly[i] as Vec2;
    const b = poly[j] as Vec2;
    const intersects =
      a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Squared distance from point `p` to segment `a`->`b`. */
function distSqToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-12) {
    const px = p.x - a.x;
    const pz = p.z - a.z;
    return px * px + pz * pz;
  }
  let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cz = a.z + t * dz;
  const ex = p.x - cx;
  const ez = p.z - cz;
  return ex * ex + ez * ez;
}

/** Minimum distance from a point to any wall segment of the polygon. */
function distanceToWalls(poly: Vec2[], p: Vec2): number {
  let min = Infinity;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i] as Vec2;
    const b = poly[(i + 1) % n] as Vec2;
    const d = Math.sqrt(distSqToSegment(p, a, b));
    if (d < min) min = d;
  }
  return min;
}

/** Rotate a local (lx, lz) offset by `theta` into world XZ. */
function rotate(lx: number, lz: number, theta: number): Vec2 {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return { x: lx * cos - lz * sin, z: lx * sin + lz * cos };
}

/** The four world-space footprint corners of an item. */
function footprintCorners(center: Vec2, dims: Dimensions3D, rotationY: number): Vec2[] {
  const hw = dims.w / 2;
  const hd = dims.d / 2;
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd]
  ].map(([lx, lz]) => {
    const r = rotate(lx as number, lz as number, rotationY);
    return { x: center.x + r.x, z: center.z + r.z };
  });
}

/** Build a transient FurnitureItem for AABB reuse against core's collision. */
function asItem(center: Vec2, dims: Dimensions3D, rotationY: number): FurnitureItem {
  return {
    id: "__probe__",
    catalogId: "__probe__",
    position: { x: center.x, y: 0, z: center.z },
    rotationY,
    scale: 1,
    dimensions: dims
  };
}

// ---------------------------------------------------------------------------
// Candidate generation
// ---------------------------------------------------------------------------

/** Rotation whose local +Z (item "front") points along `dir`. */
function facingRotation(dir: Vec2): number {
  // front(theta) = (-sin, cos); solve for theta pointing along dir.
  return Math.atan2(-dir.x, dir.z);
}

interface WallInfo {
  index: number;
  start: Vec2;
  end: Vec2;
  length: number;
  dir: Vec2;
  inwardNormal: Vec2;
}

function wallInfos(room: Room, poly: Vec2[]): WallInfo[] {
  const segments = wallSegments(room);
  return segments
    .map((s, index) => ({ segment: s, index }))
    .filter(({ segment }) => segment.length > 1e-6)
    .map(({ segment: s, index }) => {
      const start = { x: s.wall.start.x, z: s.wall.start.z };
      const end = { x: s.wall.end.x, z: s.wall.end.z };
      const dir = { x: s.dir.x, z: s.dir.z };
      // s.normal is 90deg clockwise from dir; pick the inward-pointing sign by
      // probing just off the wall midpoint.
      let nx = s.normal.x;
      let nz = s.normal.z;
      const mid = { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 };
      const probe = { x: mid.x + nx * 0.05, z: mid.z + nz * 0.05 };
      if (!pointInPolygon(poly, probe)) {
        nx = -nx;
        nz = -nz;
      }
      return { index, start, end, length: s.length, dir, inwardNormal: { x: nx, z: nz } };
    });
}

/**
 * Generate ordered candidate (position, orientation) pairs. Order matters:
 * wall-flush first (so `nearWall`/`corner` naturally win when tied), then an
 * interior grid. Every candidate here is a *proposal*; hard-constraint
 * filtering happens later.
 */
function generateCandidates(
  poly: Vec2[],
  walls: WallInfo[],
  dims: Dimensions3D,
  constraints: SolverConstraints,
  facingTarget: FurnitureItem | undefined,
  wallMargin: number
): Candidate[] {
  const candidates: Candidate[] = [];
  let order = 0;
  const hw = dims.w / 2;
  const hd = dims.d / 2;

  // 1. Wall-flush candidates: back against each wall, front into the room.
  for (const wall of walls) {
    const rotationY = facingRotation(wall.inwardNormal);
    // Offset from the wall centerline to the item center: half wall thickness
    // (to reach the inner face) + item half-depth + gap.
    const offset = wallMargin + hd;
    const usable = wall.length - 2 * (hw + WALL_GAP);
    if (usable < 0) continue;
    const steps = Math.max(1, Math.ceil(usable / WALL_STEP));
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0.5 : hw + WALL_GAP + (usable * i) / steps;
      const along = {
        x: wall.start.x + wall.dir.x * t,
        z: wall.start.z + wall.dir.z * t
      };
      const center = {
        x: along.x + wall.inwardNormal.x * offset,
        z: along.z + wall.inwardNormal.z * offset
      };
      candidates.push({ center, rotationY, order: order++ });
    }
  }

  // 2. Interior grid candidates over the polygon's bounding box.
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }

  const rotations = orientationsFor(constraints, facingTarget);
  for (let x = minX + wallMargin; x <= maxX - wallMargin + 1e-9; x += GRID_STEP) {
    for (let z = minZ + wallMargin; z <= maxZ - wallMargin + 1e-9; z += GRID_STEP) {
      const center = { x, z };
      if (!pointInPolygon(poly, center)) continue;
      for (const rotationY of rotations) {
        candidates.push({ center, rotationY, order: order++ });
      }
    }
  }

  return candidates;
}

/** Interior-grid orientations to try (kept small & deterministic). */
function orientationsFor(constraints: SolverConstraints, facingTarget: FurnitureItem | undefined): number[] {
  const base = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  if (constraints.facingItem && facingTarget) {
    // A rotation that faces the target is worth trying explicitly.
    return base; // scoring rewards facing; base orientations cover the options.
  }
  return base;
}

// ---------------------------------------------------------------------------
// Hard-constraint validation
// ---------------------------------------------------------------------------

interface Obstacle {
  aabb: AABB;
}

function insideRoom(poly: Vec2[], corners: Vec2[], wallMargin: number): boolean {
  for (const c of corners) {
    if (!pointInPolygon(poly, c)) return false;
    if (distanceToWalls(poly, c) < wallMargin - 1e-6) return false;
  }
  return true;
}

function collides(aabb: AABB, obstacles: Obstacle[]): boolean {
  for (const o of obstacles) {
    if (aabbIntersects(aabb, o.aabb)) return true;
  }
  return false;
}

/** The clearance zone in front of an item (along its local +Z front). */
function frontClearanceZone(center: Vec2, dims: Dimensions3D, rotationY: number, clearance: number): FurnitureItem {
  const hd = dims.d / 2;
  const front = rotate(0, hd + clearance / 2, rotationY);
  const zoneCenter = { x: center.x + front.x, z: center.z + front.z };
  return asItem(zoneCenter, { w: dims.w, d: clearance, h: dims.h }, rotationY);
}

// ---------------------------------------------------------------------------
// Scoring (soft preferences)
// ---------------------------------------------------------------------------

function nearestVertexDist(poly: Vec2[], p: Vec2): number {
  let min = Infinity;
  for (const v of poly) {
    const d = Math.hypot(v.x - p.x, v.z - p.z);
    if (d < min) min = d;
  }
  return min;
}

function windowCenters(room: Room, openings: Opening[]): Vec2[] {
  const segments = wallSegments(room);
  const centers: Vec2[] = [];
  for (const opening of openings) {
    if (opening.kind !== "window") continue;
    const seg = segments.find((segment) => segment.wall.id === opening.wallId);
    if (!seg) continue;
    centers.push(pointAlongWall(seg.wall, opening.offset + opening.width / 2));
  }
  return centers;
}

interface ScoreContext {
  poly: Vec2[];
  centroid: Vec2;
  windows: Vec2[];
  facingTarget: FurnitureItem | undefined;
  adjacentTarget: FurnitureItem | undefined;
  constraints: SolverConstraints;
  bboxDiagonal: number;
}

/** Higher is better. Purely soft — every scored candidate is already valid. */
function scoreCandidate(candidate: Candidate, ctx: ScoreContext): number {
  const { center, rotationY } = candidate;
  const { constraints } = ctx;
  let score = 0;

  const wallDist = distanceToWalls(ctx.poly, center);

  if (constraints.nearWall || constraints.towardWall) {
    // Reward hugging a wall (smaller distance is better).
    score += 5 - clamp01(wallDist / ctx.bboxDiagonal) * 5;
  }

  if (constraints.zone === "corner") {
    const cornerDist = nearestVertexDist(ctx.poly, center);
    score += 5 - clamp01(cornerDist / ctx.bboxDiagonal) * 5;
  } else if (constraints.zone === "center") {
    const d = Math.hypot(center.x - ctx.centroid.x, center.z - ctx.centroid.z);
    score += 5 - clamp01(d / ctx.bboxDiagonal) * 5;
  } else if (constraints.zone === "window") {
    if (ctx.windows.length > 0) {
      let best = Infinity;
      for (const w of ctx.windows) best = Math.min(best, Math.hypot(center.x - w.x, center.z - w.z));
      score += 5 - clamp01(best / ctx.bboxDiagonal) * 5;
    }
  }

  if (constraints.adjacentTo && ctx.adjacentTarget) {
    const t = ctx.adjacentTarget.position;
    const d = Math.hypot(center.x - t.x, center.z - t.z);
    score += 4 - clamp01(d / ctx.bboxDiagonal) * 4;
  }

  if (constraints.facingItem && ctx.facingTarget) {
    const t = ctx.facingTarget.position;
    const toTarget = { x: t.x - center.x, z: t.z - center.z };
    const len = Math.hypot(toTarget.x, toTarget.z);
    if (len > 1e-6) {
      const front = rotate(0, 1, rotationY); // local +Z front in world
      const dot = (front.x * toTarget.x + front.z * toTarget.z) / len;
      score += (dot + 1) * 3; // dot in [-1,1] -> [0,6]
      // Mild reward for a comfortable, not-too-far facing distance.
      score += 2 - clamp01(len / ctx.bboxDiagonal) * 2;
    }
  }

  return score;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function lookupItem(
  id: string | undefined,
  existing: FurnitureItem[],
  placedThisBatch: FurnitureItem[]
): FurnitureItem | undefined {
  if (!id) return undefined;
  return placedThisBatch.find((i) => i.id === id) ?? existing.find((i) => i.id === id);
}

/**
 * Solve a batch of placement requests against a document and a room. Requests
 * are processed in order; each successful placement becomes an obstacle for
 * later ones, so a multi-item layout never self-collides. Moves (`isExisting`)
 * exclude their own current footprint.
 */
export function solve(document: SceneDocument, room: Room | undefined, requests: PlacementRequest[]): SolveResult {
  const placed: SolvedPlacement[] = [];
  const failed: PlacementFailure[] = [];

  if (!room) {
    for (const req of requests) {
      failed.push({
        itemId: req.itemId,
        catalogId: req.catalogId,
        reason: "no-room",
        message: "There is no room to place furniture in yet."
      });
    }
    return { placed, failed };
  }

  const poly = roomPolygon(room);
  const walls = wallInfos(room, poly);
  const centroid2 = polygonCentroid(roomCorners(room));
  const centroid: Vec2 = { x: centroid2.x, z: centroid2.z };
  const openings = document.openings.filter((opening) => room.walls.some((wall) => wall.id === opening.wallId));
  const windows = windowCenters(room, openings);
  const wallMargin = roomWallMargin(room);

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const bboxDiagonal = Math.max(1e-6, Math.hypot(maxX - minX, maxZ - minZ));

  // Door swing zones stay clear for every placement in this batch.
  const doorZones = doorSwingZones(room, openings, walls);

  const placedItems: FurnitureItem[] = [];

  for (const req of requests) {
    const clearance = req.constraints.minClearance ?? DEFAULT_CLEARANCE;
    const enforceFront = req.category ? needsFrontClearance(req.category) : false;

    const facingTarget = lookupItem(req.constraints.facingItem, document.furniture, placedItems);
    const adjacentTarget = lookupItem(req.constraints.adjacentTo, document.furniture, placedItems);

    // Obstacles = existing furniture (minus the item being moved) + already
    // placed batch items + door swing zones.
    const obstacles: Obstacle[] = [];
    for (const item of document.furniture) {
      if (req.isExisting && item.id === req.itemId) continue;
      obstacles.push({ aabb: furnitureAABB(item) });
    }
    for (const item of placedItems) obstacles.push({ aabb: furnitureAABB(item) });
    for (const zone of doorZones) obstacles.push({ aabb: zone });

    const candidates = generateCandidates(poly, walls, req.dimensions, req.constraints, facingTarget, wallMargin);

    const scoreCtx: ScoreContext = {
      poly,
      centroid,
      windows,
      facingTarget,
      adjacentTarget,
      constraints: req.constraints,
      bboxDiagonal
    };

    let best: { candidate: Candidate; score: number } | undefined;
    let sawInsideCandidate = false;

    for (const candidate of candidates) {
      const corners = footprintCorners(candidate.center, req.dimensions, candidate.rotationY);
      if (!insideRoom(poly, corners, wallMargin)) continue;
      sawInsideCandidate = true;

      const aabb = furnitureAABB(asItem(candidate.center, req.dimensions, candidate.rotationY));
      if (collides(aabb, obstacles)) continue;

      if (enforceFront) {
        const zone = frontClearanceZone(candidate.center, req.dimensions, candidate.rotationY, clearance);
        const zoneCorners = footprintCorners(
          { x: zone.position.x, z: zone.position.z },
          zone.dimensions!,
          zone.rotationY
        );
        if (!insideRoom(poly, zoneCorners, wallMargin)) continue;
        if (collides(furnitureAABB(zone), obstacles)) continue;
      }

      const score = scoreCandidate(candidate, scoreCtx);
      if (
        !best ||
        score > best.score + 1e-9 ||
        (Math.abs(score - best.score) <= 1e-9 && candidate.order < best.candidate.order)
      ) {
        best = { candidate, score };
      }
    }

    if (best) {
      placed.push({
        itemId: req.itemId,
        catalogId: req.catalogId,
        position: { x: best.candidate.center.x, y: 0, z: best.candidate.center.z },
        rotationY: best.candidate.rotationY,
        dimensions: req.dimensions
      });
      placedItems.push(asItem(best.candidate.center, req.dimensions, best.candidate.rotationY));
      // Rename the probe id so subsequent adjacency lookups can resolve it.
      placedItems[placedItems.length - 1]!.id = req.itemId;
      placedItems[placedItems.length - 1]!.catalogId = req.catalogId;
      continue;
    }

    // No valid candidate — diagnose why for a useful, honest failure.
    failed.push({
      itemId: req.itemId,
      catalogId: req.catalogId,
      reason: diagnoseFailure(req, room, poly, wallMargin, sawInsideCandidate, enforceFront),
      message: failureMessage(req, sawInsideCandidate, enforceFront)
    });
  }

  return { placed, failed };
}

export interface ValidateOptions {
  /** Walkway to keep clear in front of the item (m). */
  clearance?: number;
  /** Whether to enforce the front-clearance zone. */
  enforceFront?: boolean;
  /** Id of an existing item to exclude from collision (the item being moved). */
  excludeId?: string;
}

/**
 * Whether a concrete item placement is valid against the room and document:
 * inside the room, no AABB collision (excluding `excludeId` and honoring door
 * swing zones), and — if `enforceFront` — its front clearance zone is clear and
 * in-room. Used by the executor for in-place moves/rotations where a position
 * is already known and only needs validating (never repositioned silently).
 */
export function isPlacementValid(
  document: SceneDocument,
  room: Room | undefined,
  item: FurnitureItem,
  options: ValidateOptions = {}
): boolean {
  if (!room) return false;
  const poly = roomPolygon(room);
  const walls = wallInfos(room, poly);
  const wallMargin = roomWallMargin(room);
  const center: Vec2 = { x: item.position.x, z: item.position.z };

  const corners = footprintCorners(center, item.dimensions!, item.rotationY);
  if (!insideRoom(poly, corners, wallMargin)) return false;

  const obstacles: Obstacle[] = [];
  for (const other of document.furniture) {
    if (other.id === item.id || other.id === options.excludeId) continue;
    obstacles.push({ aabb: furnitureAABB(other) });
  }
  const openings = document.openings.filter((opening) => room.walls.some((wall) => wall.id === opening.wallId));
  for (const zone of doorSwingZones(room, openings, walls)) obstacles.push({ aabb: zone });

  const aabb = furnitureAABB(asItem(center, item.dimensions!, item.rotationY));
  if (collides(aabb, obstacles)) return false;

  if (options.enforceFront) {
    const clearance = options.clearance ?? DEFAULT_CLEARANCE;
    const zone = frontClearanceZone(center, item.dimensions!, item.rotationY, clearance);
    const zoneCorners = footprintCorners(
      { x: zone.position.x, z: zone.position.z },
      zone.dimensions!,
      zone.rotationY
    );
    if (!insideRoom(poly, zoneCorners, wallMargin)) return false;
    if (collides(furnitureAABB(zone), obstacles)) return false;
  }

  return true;
}

/** Door swing zones (a square in front of each door), as AABBs to avoid. */
function doorSwingZones(room: Room, openings: Opening[], walls: WallInfo[]): AABB[] {
  const segments = wallSegments(room);
  const zones: AABB[] = [];
  for (const opening of openings) {
    if (opening.kind !== "door") continue;
    const seg = segments.find((segment) => segment.wall.id === opening.wallId);
    if (!seg) continue;
    const wall = walls.find((w) => w.index === segments.indexOf(seg));
    if (!wall) continue;
    const doorCenter = pointAlongWall(seg.wall, opening.offset + opening.width / 2);
    const swing = opening.width;
    const zoneCenter = {
      x: doorCenter.x + wall.inwardNormal.x * (swing / 2),
      z: doorCenter.z + wall.inwardNormal.z * (swing / 2)
    };
    zones.push(
      furnitureAABB({
        id: "__door__",
        catalogId: "__door__",
        position: { x: zoneCenter.x, y: 0, z: zoneCenter.z },
        rotationY: 0,
        scale: 1,
        dimensions: { w: swing, d: swing, h: 1 }
      })
    );
  }
  return zones;
}

function roomWallMargin(room: Room): number {
  const thickness = room.walls.length > 0 ? Math.max(...room.walls.map((wall) => wall.thickness)) : 0.12;
  return thickness / 2 + WALL_GAP;
}

function itemFitsRoomBounds(poly: Vec2[], dims: Dimensions3D, wallMargin: number): boolean {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const availW = maxX - minX - 2 * wallMargin;
  const availD = maxZ - minZ - 2 * wallMargin;
  const smallSide = Math.min(dims.w, dims.d);
  return smallSide <= Math.max(availW, availD) && smallSide <= Math.min(availW, availD) + 1e-9;
}

function diagnoseFailure(
  req: PlacementRequest,
  _room: Room,
  poly: Vec2[],
  wallMargin: number,
  sawInsideCandidate: boolean,
  enforceFront: boolean
): FailureReason {
  if (!itemFitsRoomBounds(poly, req.dimensions, wallMargin)) return "too-big";
  if (!sawInsideCandidate) return "too-big";
  if (enforceFront) return "no-clearance";
  if (req.constraints.facingItem || req.constraints.adjacentTo) return "unsatisfiable-constraint";
  return "no-space";
}

function failureMessage(req: PlacementRequest, sawInsideCandidate: boolean, enforceFront: boolean): string {
  if (!sawInsideCandidate) {
    return `"${req.catalogId}" is too large to fit inside this room.`;
  }
  if (enforceFront) {
    return `Could not place "${req.catalogId}" while keeping the required walkway clear in front of it.`;
  }
  return `Could not find a free, collision-free spot for "${req.catalogId}" under the given constraints.`;
}
