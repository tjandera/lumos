import * as THREE from 'three';
import type { Wall, Opening } from '@interior/core';

export interface WallHole {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface WallShape2D {
  length: number;
  height: number;
  thickness: number;
  /** Rectangular holes in the wall's elevation plane (x = along wall, y = up). */
  holes: WallHole[];
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Pure computation of a wall's elevation outline + opening holes, in the wall's
 * local 2D frame (x = distance from wall.start along the wall, y = height above the
 * floor). Deterministic and unit-tested; `buildWallGeometry` consumes it. Openings
 * are clamped to the wall bounds so a bad offset can never blow out the profile.
 */
export function computeWallShape(wall: Wall, openings: Opening[]): WallShape2D {
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
  const holes = openings
    .filter((o) => o.wallId === wall.id)
    .map((o) => ({
      x0: clamp(o.offset, 0, length),
      y0: clamp(o.sillHeight, 0, wall.height),
      x1: clamp(o.offset + o.width, 0, length),
      y1: clamp(o.sillHeight + o.height, 0, wall.height),
    }))
    .filter((h) => h.x1 - h.x0 > 1e-4 && h.y1 - h.y0 > 1e-4);
  return { length, height: wall.height, thickness: wall.thickness, holes };
}

/**
 * Extrude a wall from its 2D elevation profile (with holes) into a solid centered on
 * its centerline, base at y = 0. ExtrudeGeometry also builds the inner "reveal" faces
 * around each opening for free, which is why Shape-with-holes beats boolean CSG here.
 * The geometry's local +X runs along the wall, +Y is up, +Z is thickness.
 */
export function buildWallGeometry(shape2d: WallShape2D): THREE.ExtrudeGeometry {
  const { length, height, thickness, holes } = shape2d;

  const outline = new THREE.Shape();
  outline.moveTo(0, 0);
  outline.lineTo(length, 0);
  outline.lineTo(length, height);
  outline.lineTo(0, height);
  outline.lineTo(0, 0);

  for (const h of holes) {
    const path = new THREE.Path();
    path.moveTo(h.x0, h.y0);
    path.lineTo(h.x1, h.y0);
    path.lineTo(h.x1, h.y1);
    path.lineTo(h.x0, h.y1);
    path.lineTo(h.x0, h.y0);
    outline.holes.push(path);
  }

  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth: thickness,
    bevelEnabled: false,
    steps: 1,
  });
  geometry.translate(0, 0, -thickness / 2); // center thickness on the wall centerline
  return geometry;
}
