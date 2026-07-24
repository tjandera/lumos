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
}
export interface Placement {
  id: string;
  x: number;
  z: number;
  rotationY: number; // degrees
}

const GAP = 0.15; // clearance between items and from the wall start (meters)
const MARGIN = 0.05; // inset from the wall centerline
const round = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Deterministic perimeter layout. Places items back-to-wall around the room, facing
 * inward, advancing along each wall and wrapping to the next when the current one is
 * full. Items that fit never overlap (spaced by GAP). This is the placement the AI
 * proposes *intent* for — the model never emits raw coordinates.
 */
export function suggestLayout(bounds: LayoutBounds, items: LayoutItem[]): Placement[] {
  const x0 = bounds.minX + MARGIN;
  const x1 = bounds.maxX - MARGIN;
  const z0 = bounds.minZ + MARGIN;
  const z1 = bounds.maxZ - MARGIN;
  const centerX = (x0 + x1) / 2;
  const centerZ = (z0 + z1) / 2;

  // Each wall: origin corner, along-direction, inward normal, length, inward-facing yaw.
  const walls = [
    { ox: x0, oz: z0, dx: 1, dz: 0, nx: 0, nz: 1, len: x1 - x0, rot: 0 },
    { ox: x1, oz: z1, dx: -1, dz: 0, nx: 0, nz: -1, len: x1 - x0, rot: 180 },
    { ox: x0, oz: z1, dx: 0, dz: -1, nx: 1, nz: 0, len: z1 - z0, rot: 90 },
    { ox: x1, oz: z0, dx: 0, dz: 1, nx: -1, nz: 0, len: z1 - z0, rot: 270 },
  ];

  const placements: Placement[] = [];
  let wi = 0;
  let cursor = GAP;

  for (const item of items) {
    let placed = false;
    for (let tries = 0; tries < walls.length; tries++) {
      const w = walls[wi];
      const isFirstOnWall = cursor <= GAP + 1e-9;
      if (cursor + item.width <= w.len || isFirstOnWall) {
        const t = cursor + item.width / 2;
        placements.push({
          id: item.id,
          x: round(w.ox + w.dx * t + w.nx * (item.depth / 2)),
          z: round(w.oz + w.dz * t + w.nz * (item.depth / 2)),
          rotationY: w.rot,
        });
        cursor += item.width + GAP;
        placed = true;
        break;
      }
      wi = (wi + 1) % walls.length;
      cursor = GAP;
    }
    if (!placed) {
      placements.push({ id: item.id, x: round(centerX), z: round(centerZ), rotationY: 0 });
    }
  }
  return placements;
}
