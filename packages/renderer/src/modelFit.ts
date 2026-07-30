/**
 * Pure math for fitting a loaded GLB's bounding box to a catalog item's
 * declared footprint/height. Kept free of three.js/GL types so it is cheaply
 * unit-testable — `FurnitureMesh.tsx` computes a `THREE.Box3` from the
 * loaded scene and passes plain `{min, max}` numbers in here.
 *
 * Convention matches the renderer's furniture frame: origin at the footprint centre on
 * the floor (y = 0), width along X, depth along Z, height up +Y.
 *
 * Why contain-fit rather than scaling to width alone: the catalog declares w/d/h for
 * every item, but scaling by width only leaves height and depth to whatever proportions
 * the source model happens to have. With models from several sources that produces
 * furniture at visibly inconsistent sizes — a chair as tall as a wardrobe. Taking the
 * smallest of the three ratios makes the declared dimensions a genuine upper bound on
 * all three axes while keeping the model undistorted.
 */

import type { Dimensions3D } from "@interior/core";

export interface Box3Like {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

export interface FitTransform {
  /** Uniform scale to apply to the loaded model. */
  scale: number;
  /** Translation to apply *after* scaling, in the parent's local space. */
  position: [number, number, number];
}

const MIN_EXTENT = 1e-6;

/**
 * Compute a uniform scale + translation so a model's bounding box:
 *  - fits within the target `dimensions` (contain-fit: the model is scaled
 *    down/up by the smallest ratio needed on any axis, so it never pokes
 *    through the declared footprint or height),
 *  - is horizontally centered on X and Z,
 *  - sits on the floor (its lowest point maps to y = 0).
 *
 * Degenerate boxes (zero-size on some axis, e.g. a flat plane) are guarded
 * against by clamping the divisor so we never divide by zero or return
 * non-finite numbers.
 */
export function computeFitTransform(bbox: Box3Like, dimensions: Dimensions3D): FitTransform {
  const rawSizeX = bbox.max.x - bbox.min.x;
  const rawSizeY = bbox.max.y - bbox.min.y;
  const rawSizeZ = bbox.max.z - bbox.min.z;

  const centerX = (bbox.min.x + bbox.max.x) / 2;
  const centerZ = (bbox.min.z + bbox.max.z) / 2;

  // A fully degenerate (point-like) box has no meaningful size to scale
  // from — fall back to identity scale rather than dividing by ~0 on every
  // axis and producing an enormous, meaningless multiplier.
  const isPointLike = rawSizeX < MIN_EXTENT && rawSizeY < MIN_EXTENT && rawSizeZ < MIN_EXTENT;
  if (isPointLike) {
    return { scale: 1, position: [-centerX, -bbox.min.y, -centerZ] };
  }

  const sizeX = Math.max(rawSizeX, MIN_EXTENT);
  const sizeY = Math.max(rawSizeY, MIN_EXTENT);
  const sizeZ = Math.max(rawSizeZ, MIN_EXTENT);

  const scaleX = dimensions.w / sizeX;
  const scaleY = dimensions.h / sizeY;
  const scaleZ = dimensions.d / sizeZ;

  const scale = Math.min(scaleX, scaleY, scaleZ);
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;

  return {
    scale: safeScale,
    position: [-centerX * safeScale, -bbox.min.y * safeScale, -centerZ * safeScale]
  };
}
