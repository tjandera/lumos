import { aabbIntersects, aabbOf, type AABB, type SceneDocument } from '@interior/core';
import { getCatalogItem, DEFAULT_ITEM } from '@interior/catalog';
import { COLLISION_IGNORED_CATALOG_IDS } from './collisionUi';

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** The document's overall room footprint (bounding box of every wall endpoint), used
 * for "where's the center of the room?" / "does this fit?" reasoning throughout the
 * app. Falls back to a generic box for a document with no rooms yet. */
export function roomBounds(doc: SceneDocument): Bounds {
  const xs: number[] = [];
  const zs: number[] = [];
  for (const room of doc.rooms) {
    for (const w of room.walls) {
      xs.push(w.start.x, w.end.x);
      zs.push(w.start.z, w.end.z);
    }
  }
  if (xs.length === 0) return { minX: -2.5, maxX: 2.5, minZ: -2, maxZ: 2 };
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

/** Sum of every room's bounding-box floor area (m²) — a good approximation for the
 * (typically rectangular) rooms this app draws, used for a friendly "≈18 m²" readout.
 * Not load-bearing for layout, and not exact for an L-shaped or otherwise non-rectangular
 * room (walls are stored as independent segments, not a guaranteed ordered polygon loop —
 * see geometry.ts's `roomCorners` — so a bounding box is the honest, robust answer here). */
export function approxFloorAreaM2(doc: SceneDocument): number {
  let total = 0;
  for (const room of doc.rooms) {
    const xs: number[] = [];
    const zs: number[] = [];
    for (const w of room.walls) {
      xs.push(w.start.x, w.end.x);
      zs.push(w.start.z, w.end.z);
    }
    if (xs.length === 0) continue;
    total += (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs));
  }
  return total;
}

function furnitureAABBs(doc: SceneDocument, excludeId?: string): AABB[] {
  return doc.furniture
    .filter((f) => f.id !== excludeId && !COLLISION_IGNORED_CATALOG_IDS.has(f.catalogId))
    .map((f) => {
      const cat = getCatalogItem(f.catalogId) ?? DEFAULT_ITEM;
      const dims = f.dimensions;
      return aabbOf({
        id: f.id,
        cx: f.position.x,
        cz: f.position.z,
        width: (dims?.w ?? cat.width) * f.scale,
        depth: (dims?.d ?? cat.depth) * f.scale,
        rotationDeg: f.rotationY,
      });
    });
}

export interface FreePlacement {
  x: number;
  z: number;
  rotationY: number;
}

const RING_STEP = 0.3; // meters between spiral rings
const MAX_RINGS = 30;
const WALL_MARGIN = 0.1; // clearance kept from the room's bounding box
const round = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Find a free (axis-aligned, rotationY 0) spot for a `width` × `depth` footprint: the
 * room center if it's open, otherwise spiral outward ring by ring until one clears
 * every existing item (rugs ignored, `excludeId` ignored — for repositioning something
 * that already exists) and stays inside the room's bounding box. If nothing opens up
 * within the search radius, falls back to the room center — dropping something new on
 * top of the pile beats losing it outside the room entirely.
 */
export function findFreePlacement(
  doc: SceneDocument,
  width: number,
  depth: number,
  excludeId?: string,
): FreePlacement {
  const bounds = roomBounds(doc);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const obstacles = furnitureAABBs(doc, excludeId);
  const hw = width / 2;
  const hd = depth / 2;

  const fits = (x: number, z: number): boolean => {
    if (x - hw < bounds.minX + WALL_MARGIN || x + hw > bounds.maxX - WALL_MARGIN) return false;
    if (z - hd < bounds.minZ + WALL_MARGIN || z + hd > bounds.maxZ - WALL_MARGIN) return false;
    const aabb: AABB = { minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd };
    return !obstacles.some((o) => aabbIntersects(aabb, o));
  };

  if (fits(cx, cz)) return { x: round(cx), z: round(cz), rotationY: 0 };

  for (let ring = 1; ring <= MAX_RINGS; ring++) {
    const radius = ring * RING_STEP;
    const pointsOnRing = 8 * ring;
    for (let i = 0; i < pointsOnRing; i++) {
      const theta = (i / pointsOnRing) * Math.PI * 2;
      const x = cx + Math.cos(theta) * radius;
      const z = cz + Math.sin(theta) * radius;
      if (fits(x, z)) return { x: round(x), z: round(z), rotationY: 0 };
    }
  }
  return { x: round(cx), z: round(cz), rotationY: 0 };
}
