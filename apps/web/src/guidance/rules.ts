/**
 * Guided design help: a pure, unit-tested plain-language placement feedback
 * engine. Given a scene document + the room it should reason about + a
 * catalog (for display names/categories), it produces a list of friendly
 * "advisories" — short, actionable tips a beginner can act on.
 *
 * Deliberately conservative: every rule here is a heuristic approximation
 * (AABB-based, not exact polygon math) because this is UX guidance, not a
 * hard constraint the way `@interior/ai`'s solver is. It never mutates the
 * document and never blocks anything — it only informs.
 *
 * No dependency on `@interior/ai` (its internals like door-swing-zone math
 * are private to `solver.ts`); the small pieces this module needs (door
 * swing zone, wall distance, point-in-polygon) are reimplemented locally,
 * scoped to what advisories need.
 */

import {
  aabbIntersects,
  deriveWallSegments,
  furnitureAABB,
  polygonAbsArea,
  type FurnitureItem,
  type Opening,
  type Room,
  type SceneDocument
} from "@interior/core";

/** Minimal shape guidance needs from a catalog item — compatible with both
 *  the web app's static catalog and `@interior/ai`'s `CatalogItem`. */
export interface GuidanceCatalogItem {
  id: string;
  name: string;
  category: string;
}

export type AdvisoryRule = "blocking-door" | "too-tight" | "tv-viewing" | "bed-window" | "crowded";

export interface Advisory {
  /** Stable id for the advisory (rule + subject items), used for dismissal. */
  id: string;
  rule: AdvisoryRule;
  message: string;
  /** Furniture item ids this advisory concerns; hovering the card highlights them. */
  itemIds: string[];
}

/** Walkway kept in front of seating/beds, in meters — mirrors the solver's default. */
export const CLEARANCE_MIN = 0.6;
/** Comfortable TV-viewing distance band, in meters. */
export const TV_DISTANCE_MIN = 2;
export const TV_DISTANCE_MAX = 3.5;
/** Furniture footprint / floor-area ratio above which a room reads as "crowded". */
export const CROWDED_RATIO = 0.4;

// ---------------------------------------------------------------------------
// Small local geometry helpers (world XZ plane) — deliberately minimal
// reimplementations, not shared with `@interior/ai`'s solver internals.
// ---------------------------------------------------------------------------

interface Vec2 {
  x: number;
  z: number;
}

function roomPolygon(room: Room): Vec2[] {
  return room.walls.map((w) => ({ x: w.x, z: w.y }));
}

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

function rotate(lx: number, lz: number, theta: number): Vec2 {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return { x: lx * cos - lz * sin, z: lx * sin + lz * cos };
}

function footprintCorners(center: Vec2, w: number, d: number, rotationY: number): Vec2[] {
  const hw = w / 2;
  const hd = d / 2;
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

function probeItem(id: string, center: Vec2, w: number, d: number, rotationY: number): FurnitureItem {
  return {
    id,
    catalogId: "__probe__",
    position: { x: center.x, y: 0, z: center.z },
    rotationY,
    dimensions: { w, d, h: 1 }
  };
}

/** Door swing zone AABB for a single door opening (reimplemented locally —
 *  see module doc comment for why this duplicates a slice of the solver). */
function doorSwingZoneAABB(room: Room, opening: Opening) {
  if (opening.type !== "door") return undefined;
  const segments = deriveWallSegments(room.walls);
  const seg = segments[opening.wallIndex];
  if (!seg) return undefined;
  const poly = roomPolygon(room);
  const doorCenter: Vec2 = {
    x: seg.start.x + seg.dir.x * opening.position,
    z: seg.start.y + seg.dir.y * opening.position
  };
  let nx = seg.normal.x;
  let nz = seg.normal.y;
  const mid: Vec2 = { x: (seg.start.x + seg.end.x) / 2, z: (seg.start.y + seg.end.y) / 2 };
  const probe: Vec2 = { x: mid.x + nx * 0.05, z: mid.z + nz * 0.05 };
  if (!pointInPolygon(poly, probe)) {
    nx = -nx;
    nz = -nz;
  }
  const swing = opening.width;
  const zoneCenter: Vec2 = { x: doorCenter.x + nx * (swing / 2), z: doorCenter.z + nz * (swing / 2) };
  return furnitureAABB(probeItem("__door__", zoneCenter, swing, swing, 0));
}

// ---------------------------------------------------------------------------
// Catalog helpers
// ---------------------------------------------------------------------------

function findCatalog(catalog: GuidanceCatalogItem[], catalogId: string): GuidanceCatalogItem | undefined {
  return catalog.find((c) => c.id === catalogId);
}

function displayName(catalog: GuidanceCatalogItem[], item: FurnitureItem): string {
  const entry = findCatalog(catalog, item.catalogId);
  return entry?.name.toLowerCase() ?? "item";
}

function isSeatingOrBed(catalog: GuidanceCatalogItem[], item: FurnitureItem): boolean {
  const entry = findCatalog(catalog, item.catalogId);
  if (!entry) return false;
  const cat = entry.category.toLowerCase();
  const name = entry.name.toLowerCase();
  return (
    cat.includes("seat") ||
    cat.includes("sofa") ||
    cat.includes("armchair") ||
    cat.includes("chair") ||
    cat.includes("bed") ||
    name.includes("sofa") ||
    name.includes("chair") ||
    name.includes("bed")
  );
}

function isBed(catalog: GuidanceCatalogItem[], item: FurnitureItem): boolean {
  const entry = findCatalog(catalog, item.catalogId);
  if (!entry) return false;
  return entry.category.toLowerCase().includes("bed") || entry.name.toLowerCase().includes("bed");
}

function isSofa(catalog: GuidanceCatalogItem[], item: FurnitureItem): boolean {
  const entry = findCatalog(catalog, item.catalogId);
  if (!entry) return false;
  return entry.category.toLowerCase().includes("sofa") || entry.name.toLowerCase().includes("sofa");
}

function isTvStand(catalog: GuidanceCatalogItem[], item: FurnitureItem): boolean {
  const entry = findCatalog(catalog, item.catalogId);
  if (!entry) return false;
  const cat = entry.category.toLowerCase();
  const name = entry.name.toLowerCase();
  return cat.includes("media") || cat.includes("tv") || name.includes("tv");
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

function blockingDoorAdvisories(
  document: SceneDocument,
  room: Room,
  catalog: GuidanceCatalogItem[]
): Advisory[] {
  const advisories: Advisory[] = [];
  for (const opening of room.openings) {
    if (opening.type !== "door") continue;
    const zone = doorSwingZoneAABB(room, opening);
    if (!zone) continue;
    for (const item of document.furniture) {
      if (aabbIntersects(furnitureAABB(item), zone)) {
        advisories.push({
          id: `blocking-door:${opening.id}:${item.id}`,
          rule: "blocking-door",
          message: `The ${displayName(catalog, item)} blocks the door.`,
          itemIds: [item.id]
        });
      }
    }
  }
  return advisories;
}

function tooTightAdvisories(
  document: SceneDocument,
  room: Room,
  catalog: GuidanceCatalogItem[]
): Advisory[] {
  const advisories: Advisory[] = [];
  const poly = roomPolygon(room);
  const wallMargin = room.wallThickness / 2;

  for (const item of document.furniture) {
    if (!isSeatingOrBed(catalog, item)) continue;
    const center: Vec2 = { x: item.position.x, z: item.position.z };
    const front = rotate(0, item.dimensions.d / 2 + CLEARANCE_MIN / 2, item.rotationY);
    const zoneCenter: Vec2 = { x: center.x + front.x, z: center.z + front.z };
    const zoneCorners = footprintCorners(zoneCenter, item.dimensions.w, CLEARANCE_MIN, item.rotationY);

    // Out of the room (or clipping a wall) counts as "no clearance".
    const clipsWall = zoneCorners.some(
      (c) => !pointInPolygon(poly, c) || distanceToWalls(poly, c) < wallMargin - 1e-6
    );

    const zoneAabb = furnitureAABB(probeItem("__zone__", zoneCenter, item.dimensions.w, CLEARANCE_MIN, item.rotationY));
    const blockedByFurniture = document.furniture.some(
      (other) => other.id !== item.id && aabbIntersects(furnitureAABB(other), zoneAabb)
    );

    if (clipsWall || blockedByFurniture) {
      advisories.push({
        id: `too-tight:${item.id}`,
        rule: "too-tight",
        message: `Tight squeeze in front of the ${displayName(catalog, item)} — aim for at least 60 cm.`,
        itemIds: [item.id]
      });
    }
  }
  return advisories;
}

function tvViewingAdvisories(document: SceneDocument, catalog: GuidanceCatalogItem[]): Advisory[] {
  const tvStands = document.furniture.filter((f) => isTvStand(catalog, f));
  const sofas = document.furniture.filter((f) => isSofa(catalog, f));
  if (tvStands.length === 0 || sofas.length === 0) return [];

  const advisories: Advisory[] = [];
  for (const tv of tvStands) {
    // Nearest sofa is the one this TV stand is "for".
    let nearest: FurnitureItem | undefined;
    let nearestDist = Infinity;
    for (const sofa of sofas) {
      const d = Math.hypot(sofa.position.x - tv.position.x, sofa.position.z - tv.position.z);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = sofa;
      }
    }
    if (!nearest) continue;
    if (nearestDist < TV_DISTANCE_MIN) {
      advisories.push({
        id: `tv-viewing:${tv.id}:${nearest.id}`,
        rule: "tv-viewing",
        message: `The TV is quite close to the sofa — aim for 2–3.5 m of viewing distance.`,
        itemIds: [tv.id, nearest.id]
      });
    } else if (nearestDist > TV_DISTANCE_MAX) {
      advisories.push({
        id: `tv-viewing:${tv.id}:${nearest.id}`,
        rule: "tv-viewing",
        message: `The TV is a bit far from the sofa for comfortable viewing — aim for 2–3.5 m.`,
        itemIds: [tv.id, nearest.id]
      });
    }
  }
  return advisories;
}

function bedWindowAdvisories(
  document: SceneDocument,
  room: Room,
  catalog: GuidanceCatalogItem[]
): Advisory[] {
  const advisories: Advisory[] = [];
  const segments = deriveWallSegments(room.walls);
  const beds = document.furniture.filter((f) => isBed(catalog, f));
  if (beds.length === 0) return advisories;

  for (const bed of beds) {
    const center: Vec2 = { x: bed.position.x, z: bed.position.z };
    for (const opening of room.openings) {
      if (opening.type !== "window") continue;
      const seg = segments[opening.wallIndex];
      if (!seg) continue;
      const windowCenter: Vec2 = {
        x: seg.start.x + seg.dir.x * opening.position,
        z: seg.start.y + seg.dir.y * opening.position
      };
      const distToWallLine = Math.sqrt(distSqToSegment(center, { x: seg.start.x, z: seg.start.y }, { x: seg.end.x, z: seg.end.y }));
      const bedHalfSpan = Math.max(bed.dimensions.w, bed.dimensions.d) / 2;
      // Bed is flush against this wall, and its footprint overlaps the window's span.
      const distToWindow = Math.hypot(center.x - windowCenter.x, center.z - windowCenter.z);
      const isAgainstWall = distToWallLine < bedHalfSpan + room.wallThickness / 2 + 0.35;
      const overlapsWindowSpan = distToWindow < bedHalfSpan + opening.width / 2;
      if (isAgainstWall && overlapsWindowSpan) {
        advisories.push({
          id: `bed-window:${bed.id}:${opening.id}`,
          rule: "bed-window",
          message: `Heads up — the ${displayName(catalog, bed)} sits right under a window. Lovely light, but consider curtains for privacy and draughts.`,
          itemIds: [bed.id]
        });
      }
    }
  }
  return advisories;
}

function crowdedAdvisory(document: SceneDocument, room: Room): Advisory[] {
  const floorArea = polygonAbsArea(room.walls);
  if (floorArea <= 0) return [];
  const footprint = document.furniture.reduce((sum, item) => sum + item.dimensions.w * item.dimensions.d, 0);
  const ratio = footprint / floorArea;
  if (ratio > CROWDED_RATIO) {
    return [
      {
        id: `crowded:${room.id}`,
        rule: "crowded",
        message: "This room is getting crowded — consider removing a piece or two, or trying a smaller alternative.",
        itemIds: document.furniture.map((f) => f.id)
      }
    ];
  }
  return [];
}

/**
 * Compute every triggered advisory for the given document/room/catalog.
 * Unordered and uncapped — pass through `prioritizeAdvisories` for display.
 */
export function computeAdvisories(
  document: SceneDocument,
  room: Room | undefined,
  catalog: GuidanceCatalogItem[]
): Advisory[] {
  if (!room) return [];
  return [
    ...blockingDoorAdvisories(document, room, catalog),
    ...tooTightAdvisories(document, room, catalog),
    ...tvViewingAdvisories(document, catalog),
    ...bedWindowAdvisories(document, room, catalog),
    ...crowdedAdvisory(document, room)
  ];
}

/** Priority order (highest first) — safety/functional issues before soft/aesthetic notes. */
const RULE_PRIORITY: AdvisoryRule[] = ["blocking-door", "too-tight", "tv-viewing", "bed-window", "crowded"];

export const MAX_ADVISORIES = 3;

/**
 * Sort advisories by rule priority (stable within a rule) and cap the count
 * shown at once, so the UI never overwhelms a beginner with a wall of tips.
 */
export function prioritizeAdvisories(advisories: Advisory[], max: number = MAX_ADVISORIES): Advisory[] {
  const indexed = advisories.map((a, i) => ({ a, i }));
  indexed.sort((x, y) => {
    const rank = RULE_PRIORITY.indexOf(x.a.rule) - RULE_PRIORITY.indexOf(y.a.rule);
    if (rank !== 0) return rank;
    return x.i - y.i;
  });
  return indexed.slice(0, max).map(({ a }) => a);
}
