import { computeCollisions, type SceneDocument, type CollisionItem } from '@interior/core';
import { getCatalogItem, DEFAULT_ITEM } from '@interior/catalog';

/** Rugs sit *under* other furniture by design — flagging them as "colliding" with
 * whatever's on top of them would just be visual noise, not a useful warning. */
export const COLLISION_IGNORED_CATALOG_IDS = new Set(['rug', 'rug-round']);

/**
 * Ids of furniture whose footprints overlap, for live red-highlighting in both the
 * 3D view and the Plan editor. Thin UI-side wrapper around core's `computeCollisions`:
 * resolves each item's real-world footprint (catalog dimensions, or its own override)
 * and excludes rugs, which are expected to overlap whatever sits on them.
 */
export function collidingFurnitureIds(doc: SceneDocument): Set<string> {
  const items: CollisionItem[] = (doc.furniture ?? [])
    .filter((f) => !COLLISION_IGNORED_CATALOG_IDS.has(f.catalogId))
    .map((f) => {
      const cat = getCatalogItem(f.catalogId) ?? DEFAULT_ITEM;
      const dims = f.dimensions;
      return {
        id: f.id,
        cx: f.position.x,
        cz: f.position.z,
        width: (dims?.w ?? cat.width) * (f.scale ?? 1),
        depth: (dims?.d ?? cat.depth) * (f.scale ?? 1),
        rotationDeg: f.rotationY ?? 0,
      };
    });
  return computeCollisions(items);
}
