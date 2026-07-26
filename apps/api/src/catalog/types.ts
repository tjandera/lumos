import type { Dimensions3D } from "@interior/core";

export type CatalogCategory =
  | "sofa"
  | "armchair"
  | "table"
  | "chair"
  | "bed"
  | "storage"
  | "desk"
  | "lighting";

/**
 * A catalog entry describing a purchasable/placeable furniture product.
 * `dimensions` are in meters (w = width/x, d = depth/z, h = height/y),
 * matching `Dimensions3D` from the core scene document so items can be
 * placed 1:1 as `FurnitureItem.dimensions`.
 */
export interface CatalogItem {
  id: string;
  name: string;
  category: CatalogCategory;
  dimensions: Dimensions3D;
  price: number;
  color: string;
  description: string;
  /**
   * Optional URL/path to a licensed GLB, served statically. Mirrors the web
   * static catalog's `modelUrl` field (see
   * `apps/web/src/catalog/catalogData.ts`) so items reconciled from this API
   * carry model wiring through `reconcileCatalog` unchanged. Absent for
   * every seed item today — no real licensed asset has been attached to the
   * API-served catalog yet; see `LICENSES.md` at the repo root.
   */
  modelUrl?: string;
}
