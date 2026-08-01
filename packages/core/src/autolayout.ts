import { aabbIntersects, aabbOf, computeCollisions, type CollisionItem } from './collision.js';

export interface LayoutBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface LayoutItem {
  id: string;
  width: number;
  depth: number;
  /** Catalog category when known (`seating`, `tables`, `storage`, `beds`, `lighting`, `decor`). */
  category?: string;
  /** Catalog item id when known — used for finer role heuristics (rug, sofa, coffee, …). */
  catalogId?: string;
}

export interface Placement {
  id: string;
  x: number;
  z: number;
  rotationY: number; // degrees
}

const GAP = 0.12;
const MARGIN = 0.1;
const round = (v: number) => Math.round(v * 1000) / 1000;

type Role =
  | 'rug'
  | 'bed'
  | 'sofa'
  | 'storage'
  | 'desk'
  | 'dining'
  | 'coffee'
  | 'chair'
  | 'side_table'
  | 'lamp'
  | 'decor'
  | 'generic';

const ROLE_ORDER: Role[] = [
  'rug',
  'bed',
  'sofa',
  'storage',
  'desk',
  'dining',
  'coffee',
  'chair',
  'side_table',
  'lamp',
  'decor',
  'generic',
];

type Wall = {
  ox: number;
  oz: number;
  dx: number;
  dz: number;
  nx: number;
  nz: number;
  len: number;
  rot: number;
};

function roleOf(item: LayoutItem): Role {
  const id = (item.catalogId ?? item.id).toLowerCase();
  const cat = (item.category ?? '').toLowerCase();

  if (id.includes('rug')) return 'rug';
  if (cat === 'beds' || id.includes('bed')) return 'bed';
  if (id.includes('sofa') || (cat === 'seating' && item.width >= 1.45)) return 'sofa';
  if (
    cat === 'storage' ||
    id.includes('bookshelf') ||
    id.includes('wardrobe') ||
    id.includes('tv-stand') ||
    id.includes('shelf') ||
    id.includes('nightstand') ||
    id.includes('console')
  ) {
    return 'storage';
  }
  if (id.includes('desk') && !id.includes('chair')) return 'desk';
  if (id.includes('dining') || id === 'round-table') return 'dining';
  if (id.includes('coffee') || id.includes('ottoman')) return 'coffee';
  if (cat === 'lighting' || id.includes('lamp')) return 'lamp';
  if (cat === 'seating') return 'chair';
  if (cat === 'tables' || id.includes('table')) return 'side_table';
  if (cat === 'decor') return 'decor';
  return 'generic';
}

function isRugItem(item: LayoutItem): boolean {
  return roleOf(item) === 'rug';
}

function toCollision(item: LayoutItem, p: Placement): CollisionItem {
  return {
    id: item.id,
    cx: p.x,
    cz: p.z,
    width: item.width,
    depth: item.depth,
    rotationDeg: p.rotationY,
  };
}

function insideBounds(bounds: LayoutBounds, item: LayoutItem, p: Placement): boolean {
  const box = aabbOf(toCollision(item, p));
  return (
    box.minX >= bounds.minX + MARGIN - 1e-6 &&
    box.maxX <= bounds.maxX - MARGIN + 1e-6 &&
    box.minZ >= bounds.minZ + MARGIN - 1e-6 &&
    box.maxZ <= bounds.maxZ - MARGIN + 1e-6
  );
}

function collides(candidate: CollisionItem, occupied: CollisionItem[], ignoreRugs: boolean): boolean {
  const a = aabbOf(candidate);
  for (const other of occupied) {
    if (ignoreRugs && other.id.startsWith('__rug__')) continue;
    const b = aabbOf(other);
    const padded = {
      minX: b.minX - GAP,
      maxX: b.maxX + GAP,
      minZ: b.minZ - GAP,
      maxZ: b.maxZ + GAP,
    };
    if (aabbIntersects(a, padded)) return true;
  }
  return false;
}

/** Strict overlap (no gap padding) — matches what the UI flags as "overlapping". */
function hardCollides(candidate: CollisionItem, occupied: CollisionItem[], ignoreRugs: boolean): boolean {
  const a = aabbOf(candidate);
  for (const other of occupied) {
    if (ignoreRugs && other.id.startsWith('__rug__')) continue;
    if (aabbIntersects(a, aabbOf(other))) return true;
  }
  return false;
}

function markOccupied(occupied: CollisionItem[], item: LayoutItem, p: Placement): void {
  const c = toCollision(item, p);
  if (isRugItem(item)) occupied.push({ ...c, id: `__rug__${c.id}` });
  else occupied.push(c);
}

function tryCommit(
  bounds: LayoutBounds,
  occupied: CollisionItem[],
  item: LayoutItem,
  x: number,
  z: number,
  rotationY: number,
  opts: { softGap?: boolean } = {},
): Placement | null {
  const softGap = opts.softGap !== false;
  const p: Placement = { id: item.id, x: round(x), z: round(z), rotationY };
  if (!insideBounds(bounds, item, p)) return null;
  const cand = toCollision(item, p);
  const ignoreRugs = !isRugItem(item);
  if (softGap) {
    if (collides(cand, occupied, ignoreRugs)) return null;
  } else if (hardCollides(cand, occupied, ignoreRugs)) {
    return null;
  }
  markOccupied(occupied, item, p);
  return p;
}

function placeAgainstWalls(
  bounds: LayoutBounds,
  occupied: CollisionItem[],
  item: LayoutItem,
  role: Role,
  walls: Wall[],
  startWall = 0,
): Placement | null {
  let wi = startWall % walls.length;
  let cursor = GAP;

  for (let tries = 0; tries < walls.length * 12; tries++) {
    const w = walls[wi]!;
    const useWidthAlong = item.width >= item.depth || role === 'sofa' || role === 'bed' || role === 'storage';
    const span = useWidthAlong ? item.width : item.depth;
    const thick = useWidthAlong ? item.depth : item.width;
    const rot = useWidthAlong ? w.rot : (w.rot + 90) % 360;

    if (cursor + span <= w.len + 1e-6) {
      const t = cursor + span / 2;
      const x = w.ox + w.dx * t + w.nx * (thick / 2 + MARGIN * 0.25);
      const z = w.oz + w.dz * t + w.nz * (thick / 2 + MARGIN * 0.25);
      const p = tryCommit(bounds, occupied, item, x, z, rot);
      if (p) return p;
      cursor += Math.max(0.2, span * 0.35);
      continue;
    }
    wi = (wi + 1) % walls.length;
    cursor = GAP;
  }
  return null;
}

/** Spiral + grid search for any free pose. Never returns an overlapping solid placement. */
function findFreeSpot(
  bounds: LayoutBounds,
  occupied: CollisionItem[],
  item: LayoutItem,
  prefer?: { x: number; z: number },
  facingDeg = 0,
): Placement | null {
  const half = Math.max(item.width, item.depth) / 2;
  const x0 = bounds.minX + MARGIN + half;
  const x1 = bounds.maxX - MARGIN - half;
  const z0 = bounds.minZ + MARGIN + half;
  const z1 = bounds.maxZ - MARGIN - half;
  if (x1 < x0 || z1 < z0) return null;

  const cx = prefer?.x ?? (x0 + x1) / 2;
  const cz = prefer?.z ?? (z0 + z1) / 2;
  const rotations = [facingDeg, (facingDeg + 90) % 360, (facingDeg + 180) % 360, (facingDeg + 270) % 360];

  const tryAt = (x: number, z: number, soft: boolean): Placement | null => {
    const clampedX = Math.min(x1, Math.max(x0, x));
    const clampedZ = Math.min(z1, Math.max(z0, z));
    for (const rot of rotations) {
      const p = tryCommit(bounds, occupied, item, clampedX, clampedZ, rot, { softGap: soft });
      if (p) return p;
    }
    return null;
  };

  // Prefer soft gap first, then hard (still non-overlapping) if the room is tight.
  for (const soft of [true, false]) {
    let hit = tryAt(cx, cz, soft);
    if (hit) return hit;

    for (let ring = 1; ring <= 40; ring++) {
      const radius = ring * 0.22;
      const points = Math.max(8, ring * 8);
      for (let i = 0; i < points; i++) {
        const theta = (i / points) * Math.PI * 2;
        hit = tryAt(cx + Math.cos(theta) * radius, cz + Math.sin(theta) * radius, soft);
        if (hit) return hit;
      }
    }

    // Dense grid sweep as last resort for this softness level.
    const step = soft ? 0.25 : 0.15;
    for (let x = x0; x <= x1 + 1e-9; x += step) {
      for (let z = z0; z <= z1 + 1e-9; z += step) {
        hit = tryAt(x, z, soft);
        if (hit) return hit;
      }
    }
  }

  return null;
}

function cornerSpots(bounds: LayoutBounds, inset: number): { x: number; z: number }[] {
  return [
    { x: bounds.minX + inset, z: bounds.minZ + inset },
    { x: bounds.maxX - inset, z: bounds.minZ + inset },
    { x: bounds.minX + inset, z: bounds.maxZ - inset },
    { x: bounds.maxX - inset, z: bounds.maxZ - inset },
  ];
}

function rebuildOccupied(itemsById: Map<string, LayoutItem>, placements: Placement[]): CollisionItem[] {
  const occupied: CollisionItem[] = [];
  for (const p of placements) {
    const item = itemsById.get(p.id);
    if (!item) continue;
    markOccupied(occupied, item, p);
  }
  return occupied;
}

/**
 * If anything still hard-overlaps (should be rare), peel colliding non-rug pieces and
 * re-seat them in free spots so the UI never shows "overlapping" after Suggest layout.
 */
function resolveOverlaps(
  bounds: LayoutBounds,
  items: LayoutItem[],
  placements: Placement[],
): Placement[] {
  const itemsById = new Map(items.map((i) => [i.id, i]));
  let result = [...placements];

  for (let pass = 0; pass < 6; pass++) {
    const solids = result
      .map((p) => {
        const item = itemsById.get(p.id);
        if (!item || isRugItem(item)) return null;
        return toCollision(item, p);
      })
      .filter((c): c is CollisionItem => !!c);

    const hits = computeCollisions(solids);
    if (hits.size === 0) return result;

    // Drop colliding pieces (largest first) and re-place into the remaining free space.
    const colliding = result
      .filter((p) => hits.has(p.id))
      .sort((a, b) => {
        const ia = itemsById.get(a.id)!;
        const ib = itemsById.get(b.id)!;
        return ib.width * ib.depth - ia.width * ia.depth;
      });

    const keep = result.filter((p) => !hits.has(p.id));
    const occupied = rebuildOccupied(itemsById, keep);
    const repaired: Placement[] = [...keep];

    for (const old of colliding) {
      const item = itemsById.get(old.id)!;
      const next =
        findFreeSpot(bounds, occupied, item, { x: old.x, z: old.z }, old.rotationY) ??
        findFreeSpot(bounds, occupied, item);
      if (next) repaired.push(next);
      // If it truly cannot fit, omit it from the result — the caller leaves its prior pose
      // only when we return no placement; we always try to return one. As a last ditch,
      // keep the old pose only if it no longer collides with `keep`.
      else {
        const cand = toCollision(item, old);
        if (!hardCollides(cand, occupied, true)) {
          markOccupied(occupied, item, old);
          repaired.push(old);
        }
      }
    }
    result = repaired;
  }
  return result;
}

/**
 * Deterministic, category-aware layout. Places rugs in the open floor, large pieces
 * against walls, tables near seating, lamps/decor in free corners. Guarantees no
 * solid-furniture AABB overlaps in the returned placements (rugs may underlie others).
 */
export function suggestLayout(bounds: LayoutBounds, items: LayoutItem[]): Placement[] {
  if (items.length === 0) return [];

  const x0 = bounds.minX + MARGIN;
  const x1 = bounds.maxX - MARGIN;
  const z0 = bounds.minZ + MARGIN;
  const z1 = bounds.maxZ - MARGIN;
  const centerX = (x0 + x1) / 2;
  const centerZ = (z0 + z1) / 2;

  const walls: Wall[] = [
    { ox: x0, oz: z0, dx: 1, dz: 0, nx: 0, nz: 1, len: Math.max(0, x1 - x0), rot: 0 },
    { ox: x1, oz: z1, dx: -1, dz: 0, nx: 0, nz: -1, len: Math.max(0, x1 - x0), rot: 180 },
    { ox: x0, oz: z1, dx: 0, dz: -1, nx: 1, nz: 0, len: Math.max(0, z1 - z0), rot: 90 },
    { ox: x1, oz: z0, dx: 0, dz: 1, nx: -1, nz: 0, len: Math.max(0, z1 - z0), rot: 270 },
  ];

  const ranked = items
    .map((item, index) => ({ item, role: roleOf(item), index }))
    .sort((a, b) => {
      const ra = ROLE_ORDER.indexOf(a.role);
      const rb = ROLE_ORDER.indexOf(b.role);
      if (ra !== rb) return ra - rb;
      const area = b.item.width * b.item.depth - a.item.width * a.item.depth;
      if (Math.abs(area) > 1e-6) return area;
      return a.index - b.index;
    });

  const placements: Placement[] = [];
  const occupied: CollisionItem[] = [];
  let primarySofa: Placement | null = null;
  let primarySofaItem: LayoutItem | null = null;
  let diningAnchor: Placement | null = null;
  let diningItem: LayoutItem | null = null;
  let wallCursor = 0;

  const accept = (p: Placement | null) => {
    if (p) placements.push(p);
    return p;
  };

  for (const { item, role } of ranked) {
    if (role === 'rug') {
      accept(
        tryCommit(bounds, occupied, item, centerX, centerZ, 0) ??
          findFreeSpot(bounds, occupied, item, { x: centerX, z: centerZ }),
      );
      continue;
    }

    if (role === 'bed' || role === 'sofa' || role === 'storage' || role === 'desk') {
      const p =
        placeAgainstWalls(bounds, occupied, item, role, walls, wallCursor) ??
        findFreeSpot(bounds, occupied, item);
      if (p) {
        wallCursor = (wallCursor + 1) % walls.length;
        if (role === 'sofa' && !primarySofa) {
          primarySofa = p;
          primarySofaItem = item;
        }
        placements.push(p);
        continue;
      }
    }

    if (role === 'dining') {
      const p =
        tryCommit(bounds, occupied, item, centerX, centerZ + 0.35, 0) ??
        findFreeSpot(bounds, occupied, item, { x: centerX, z: centerZ });
      if (p) {
        diningAnchor = p;
        diningItem = item;
        placements.push(p);
        continue;
      }
    }

    if (role === 'coffee' && primarySofa && primarySofaItem) {
      const rad = (primarySofa.rotationY * Math.PI) / 180;
      const forwardX = Math.sin(rad);
      const forwardZ = Math.cos(rad);
      const dist = primarySofaItem.depth / 2 + item.depth / 2 + 0.4;
      const tx = primarySofa.x + forwardX * dist;
      const tz = primarySofa.z + forwardZ * dist;
      accept(
        tryCommit(bounds, occupied, item, tx, tz, primarySofa.rotationY) ??
          findFreeSpot(bounds, occupied, item, { x: tx, z: tz }, primarySofa.rotationY),
      );
      continue;
    }

    if (role === 'chair') {
      if (diningAnchor && diningItem) {
        const clear = 0.28;
        const offsets = [
          { x: 0, z: diningItem.depth / 2 + item.depth / 2 + clear, rot: 180 },
          { x: 0, z: -(diningItem.depth / 2 + item.depth / 2 + clear), rot: 0 },
          { x: diningItem.width / 2 + item.width / 2 + clear, z: 0, rot: 270 },
          { x: -(diningItem.width / 2 + item.width / 2 + clear), z: 0, rot: 90 },
        ];
        let placed: Placement | null = null;
        for (const o of offsets) {
          placed = tryCommit(
            bounds,
            occupied,
            item,
            diningAnchor.x + o.x,
            diningAnchor.z + o.z,
            o.rot,
          );
          if (placed) break;
        }
        if (placed) {
          placements.push(placed);
          continue;
        }
      }
      if (primarySofa) {
        const rad = (primarySofa.rotationY * Math.PI) / 180;
        const fx = Math.sin(rad);
        const fz = Math.cos(rad);
        const tx = primarySofa.x + fx * 2.2 + fz * 1.0;
        const tz = primarySofa.z + fz * 2.2 - fx * 1.0;
        const faceSofa = (primarySofa.rotationY + 180) % 360;
        accept(
          tryCommit(bounds, occupied, item, tx, tz, faceSofa) ??
            placeAgainstWalls(bounds, occupied, item, role, walls, wallCursor) ??
            findFreeSpot(bounds, occupied, item, { x: tx, z: tz }, faceSofa),
        );
        continue;
      }
      accept(
        placeAgainstWalls(bounds, occupied, item, role, walls, wallCursor) ??
          findFreeSpot(bounds, occupied, item),
      );
      continue;
    }

    if (role === 'side_table' && primarySofa && primarySofaItem) {
      const rad = (primarySofa.rotationY * Math.PI) / 180;
      const rightX = Math.cos(rad);
      const rightZ = -Math.sin(rad);
      const side = primarySofaItem.width / 2 + item.width / 2 + 0.2;
      const tx = primarySofa.x + rightX * side;
      const tz = primarySofa.z + rightZ * side;
      accept(
        tryCommit(bounds, occupied, item, tx, tz, primarySofa.rotationY) ??
          placeAgainstWalls(bounds, occupied, item, role, walls, wallCursor) ??
          findFreeSpot(bounds, occupied, item, { x: tx, z: tz }),
      );
      continue;
    }

    if (role === 'lamp' || role === 'decor') {
      const inset = Math.max(item.width, item.depth) / 2 + MARGIN;
      let placed: Placement | null = null;
      for (const c of cornerSpots(bounds, inset)) {
        placed = tryCommit(bounds, occupied, item, c.x, c.z, 0);
        if (placed) break;
      }
      accept(placed ?? findFreeSpot(bounds, occupied, item));
      continue;
    }

    accept(
      placeAgainstWalls(bounds, occupied, item, role, walls, wallCursor) ??
        findFreeSpot(bounds, occupied, item, { x: centerX, z: centerZ }),
    );
  }

  // Anything still missing gets a collision-free free spot — never a stacked center dump.
  const placedIds = new Set(placements.map((p) => p.id));
  for (const item of items) {
    if (placedIds.has(item.id)) continue;
    const p = findFreeSpot(bounds, occupied, item);
    if (p) {
      placements.push(p);
      placedIds.add(p.id);
    }
  }

  // Ensure every item has a placement when physically possible; resolve any residual overlaps.
  const resolved = resolveOverlaps(bounds, items, placements);

  // Guarantee one entry per input id when a free cell exists after resolve.
  const finalIds = new Set(resolved.map((p) => p.id));
  const occupiedFinal = rebuildOccupied(new Map(items.map((i) => [i.id, i])), resolved);
  for (const item of items) {
    if (finalIds.has(item.id)) continue;
    const p = findFreeSpot(bounds, occupiedFinal, item);
    if (p) resolved.push(p);
  }

  return resolveOverlaps(bounds, items, resolved);
}
