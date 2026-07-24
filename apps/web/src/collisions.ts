import { useMemo } from 'react';
import { computeCollisions, type SceneDocument } from '@interior/core';
import { getCatalogItem } from '@interior/catalog';

/** Ids of furniture whose footprints overlap, resolved against catalog dimensions. */
export function useCollidingFurniture(doc: SceneDocument): Set<string> {
  return useMemo(
    () =>
      computeCollisions(
        doc.furniture.map((f) => {
          const cat = getCatalogItem(f.catalogId);
          return {
            id: f.id,
            cx: f.position.x,
            cz: f.position.z,
            width: (cat?.width ?? 0.6) * f.scale,
            depth: (cat?.depth ?? 0.6) * f.scale,
            rotationDeg: f.rotationY,
          };
        }),
      ),
    [doc.furniture],
  );
}
