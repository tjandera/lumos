import type { FurnitureItem } from "./types.js";

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Compute the axis-aligned bounding box footprint (X/Z plane) of a
 * furniture item, accounting for rotation about the Y axis by using the
 * rotated bounding box of the item's width/depth.
 */
export function furnitureAABB(item: FurnitureItem): AABB {
  const { position, rotationY, dimensions } = item;
  const halfW = dimensions.w / 2;
  const halfD = dimensions.d / 2;

  const cos = Math.abs(Math.cos(rotationY));
  const sin = Math.abs(Math.sin(rotationY));

  const extentX = halfW * cos + halfD * sin;
  const extentZ = halfW * sin + halfD * cos;

  return {
    minX: position.x - extentX,
    maxX: position.x + extentX,
    minZ: position.z - extentZ,
    maxZ: position.z + extentZ
  };
}

/**
 * Whether two axis-aligned bounding boxes overlap. Touching edges (equal
 * bounds) are NOT considered an overlap.
 */
export function aabbIntersects(a: AABB, b: AABB): boolean {
  const overlapsX = a.minX < b.maxX && b.minX < a.maxX;
  const overlapsZ = a.minZ < b.maxZ && b.minZ < a.maxZ;
  return overlapsX && overlapsZ;
}

/**
 * Whether two furniture items collide, based on their rotated XZ-plane
 * footprints. Touching edges (e.g. two boxes flush against each other) are
 * not considered a collision.
 */
export function aabbOverlap(a: FurnitureItem, b: FurnitureItem): boolean {
  return aabbIntersects(furnitureAABB(a), furnitureAABB(b));
}
