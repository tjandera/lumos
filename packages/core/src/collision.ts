import type { Dimensions3D, FurnitureInstance } from './schema.js';

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Generic footprint input, for callers that aren't holding a FurnitureInstance. */
export interface CollisionItem {
  id: string;
  cx: number;
  cz: number;
  width: number;
  depth: number;
  /** DEGREES — the document's angle unit throughout. See units.ts. */
  rotationDeg: number;
}

const EPS = 1e-3; // touching edges shouldn't count as a collision

/** World axis-aligned bounding box of an item's (possibly rotated) footprint. */
export function aabbOf(it: CollisionItem): AABB {
  const hw = it.width / 2;
  const hd = it.depth / 2;
  const r = (it.rotationDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(r));
  const sin = Math.abs(Math.sin(r));
  const ex = hw * cos + hd * sin;
  const ez = hw * sin + hd * cos;
  return { minX: it.cx - ex, maxX: it.cx + ex, minZ: it.cz - ez, maxZ: it.cz + ez };
}

/**
 * Footprint of a furniture instance. Size comes from the item's own `dimensions`
 * override when present, otherwise from `fallback` — which the caller reads out of the
 * catalog, since core deliberately doesn't depend on the catalog package.
 *
 * NOTE ON UNITS: `rotationY` is in DEGREES here. One of the two codebases merged into
 * this one treated it as radians; conflating them silently produces footprints that are
 * wrong for every item that isn't axis-aligned, so the conversion is explicit.
 */
export function furnitureAABB(item: FurnitureInstance, fallback?: Dimensions3D): AABB {
  const dims = item.dimensions ?? fallback;
  if (!dims) throw new Error(`No dimensions for furniture ${item.id}: pass a catalog fallback`);
  const scale = item.scale ?? 1;
  return aabbOf({
    id: item.id,
    cx: item.position.x,
    cz: item.position.z,
    width: dims.w * scale,
    depth: dims.d * scale,
    rotationDeg: item.rotationY,
  });
}

/** Whether two AABBs overlap. Touching edges are NOT an overlap. */
export function aabbIntersects(a: AABB, b: AABB): boolean {
  return a.minX < b.maxX - EPS && a.maxX > b.minX + EPS && a.minZ < b.maxZ - EPS && a.maxZ > b.minZ + EPS;
}

/**
 * Ids of items whose footprints overlap in the X/Z plane. Rotated footprints are
 * reduced to their world AABB (a slight over-estimate for rotated pieces — appropriate
 * for placement reasoning rather than physics).
 */
export function computeCollisions(items: CollisionItem[]): Set<string> {
  const boxes = items.map(aabbOf);
  const hit = new Set<string>();
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (aabbIntersects(boxes[i]!, boxes[j]!)) {
        hit.add(items[i]!.id);
        hit.add(items[j]!.id);
      }
    }
  }
  return hit;
}
