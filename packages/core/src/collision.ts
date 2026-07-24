export interface CollisionItem {
  id: string;
  cx: number;
  cz: number;
  width: number;
  depth: number;
  rotationDeg: number;
}

interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const EPS = 1e-3; // touching edges shouldn't count as a collision

/** World axis-aligned bounding box of an item's (possibly rotated) footprint. */
function aabbOf(it: CollisionItem): AABB {
  const hw = it.width / 2;
  const hd = it.depth / 2;
  const r = (it.rotationDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(r));
  const sin = Math.abs(Math.sin(r));
  const ex = hw * cos + hd * sin;
  const ez = hw * sin + hd * cos;
  return { minX: it.cx - ex, maxX: it.cx + ex, minZ: it.cz - ez, maxZ: it.cz + ez };
}

function overlaps(a: AABB, b: AABB): boolean {
  return a.minX < b.maxX - EPS && a.maxX > b.minX + EPS && a.minZ < b.maxZ - EPS && a.maxZ > b.minZ + EPS;
}

/**
 * Returns the ids of items whose footprints overlap in the X/Z plane. Rotated
 * footprints are reduced to their world AABB (a slight over-estimate for rotated
 * pieces — appropriate for a placement warning rather than physics).
 */
export function computeCollisions(items: CollisionItem[]): Set<string> {
  const boxes = items.map(aabbOf);
  const hit = new Set<string>();
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (overlaps(boxes[i], boxes[j])) {
        hit.add(items[i].id);
        hit.add(items[j].id);
      }
    }
  }
  return hit;
}
