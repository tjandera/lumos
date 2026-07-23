/**
 * Static, typed furniture catalog for Phase 2a. No network / GLB downloads yet:
 * every item is rendered as a parametric primitive composition (see
 * `../scene3d/FurnitureMesh.tsx`) keyed by `id`, so a real GLB can replace the
 * primitive builder for a given `id` later without touching the rest of the app.
 *
 * Dimensions are in meters: `w` (width, local X), `d` (depth, local Z),
 * `h` (height, local Y). Prices are indicative, in whole currency units.
 */

export type FurnitureCategory =
  | "seating"
  | "tables"
  | "beds"
  | "storage"
  | "desks"
  | "media"
  | "lighting";

export interface CatalogItem {
  id: string;
  name: string;
  /**
   * Loosened from the `FurnitureCategory` union (string) so items reconciled
   * in from the API — which uses a different category vocabulary
   * (`sofa`/`armchair`/… vs. this file's `seating`/`tables`/…) — can be
   * displayed and grouped without a lossy remap. Known categories still get
   * their labeled group in the catalog panel; unknown ones fall into "Other".
   */
  category: string;
  /** Footprint + height in meters. */
  dimensions: { w: number; d: number; h: number };
  price: number;
  /** Base surface color (hex). Primitive builders may derive accent shades. */
  color: string;
  /** Present for API-sourced items; absent for the static seed catalog. */
  description?: string;
  /** Where this entry came from — used only for UI affordances (e.g. a badge). */
  source?: "static" | "api";
  /**
   * Optional path/URL to a licensed GLB replacing the primitive builder for
   * this item (see `../scene3d/FurnitureMesh.tsx` — `modelUrl` present + a
   * successful load renders the GLB, scaled/centered to `dimensions`; absent
   * or a load error falls back to the primitive builder unchanged). Web-served
   * static seed items use a path under `apps/web/public/models/`. See
   * `LICENSES.md` at the repo root for the source + license of every asset
   * referenced here.
   */
  modelUrl?: string;
}

/**
 * Ordered list of categories for grouping in the catalog panel. Kept explicit
 * (rather than derived) so the UI order is stable and intentional.
 */
export const FURNITURE_CATEGORIES: { id: FurnitureCategory; label: string }[] = [
  { id: "seating", label: "Seating" },
  { id: "tables", label: "Tables" },
  { id: "beds", label: "Beds" },
  { id: "storage", label: "Storage" },
  { id: "desks", label: "Desks" },
  { id: "media", label: "Media" },
  { id: "lighting", label: "Lighting" }
];

export const CATALOG: CatalogItem[] = [
  {
    id: "sofa-3seat",
    name: "3-Seat Sofa",
    category: "seating",
    dimensions: { w: 2.1, d: 0.9, h: 0.8 },
    price: 899,
    color: "#5b6b7a"
  },
  {
    id: "armchair",
    name: "Armchair",
    category: "seating",
    dimensions: { w: 0.85, d: 0.85, h: 0.8 },
    price: 349,
    color: "#7a5b5b"
  },
  {
    id: "dining-chair",
    name: "Dining Chair",
    category: "seating",
    dimensions: { w: 0.45, d: 0.5, h: 0.9 },
    price: 79,
    color: "#8a6b4a"
  },
  {
    id: "coffee-table",
    name: "Coffee Table",
    category: "tables",
    dimensions: { w: 1.1, d: 0.6, h: 0.4 },
    price: 199,
    color: "#6b4f34",
    // Procedurally generated placeholder GLB (see LICENSES.md) proving the
    // modelUrl -> GLTF load -> bbox-fit pipeline end to end. Not a licensed
    // third-party asset — swap for a real CC0 model per LICENSES.md's
    // "how to add a real asset" notes without touching any other code.
    modelUrl: "/models/test-box.glb"
  },
  {
    id: "dining-table",
    name: "Dining Table",
    category: "tables",
    dimensions: { w: 1.6, d: 0.9, h: 0.75 },
    price: 549,
    color: "#5e4326"
  },
  {
    id: "bed-single",
    name: "Single Bed",
    category: "beds",
    dimensions: { w: 1.0, d: 2.0, h: 0.5 },
    price: 399,
    color: "#8891a0"
  },
  {
    id: "bed-double",
    name: "Double Bed",
    category: "beds",
    dimensions: { w: 1.6, d: 2.05, h: 0.5 },
    price: 699,
    color: "#8891a0"
  },
  {
    id: "wardrobe",
    name: "Wardrobe",
    category: "storage",
    dimensions: { w: 1.2, d: 0.6, h: 2.1 },
    price: 649,
    color: "#7d6a52"
  },
  {
    id: "bookshelf",
    name: "Bookshelf",
    category: "storage",
    dimensions: { w: 0.9, d: 0.35, h: 1.8 },
    price: 249,
    color: "#6f5a3d"
  },
  {
    id: "desk",
    name: "Desk",
    category: "desks",
    dimensions: { w: 1.4, d: 0.7, h: 0.75 },
    price: 329,
    color: "#4a4a4a"
  },
  {
    id: "tv-stand",
    name: "TV Stand",
    category: "media",
    dimensions: { w: 1.6, d: 0.4, h: 0.5 },
    price: 279,
    color: "#3a3a3a"
  },
  {
    id: "floor-lamp",
    name: "Floor Lamp",
    category: "lighting",
    dimensions: { w: 0.4, d: 0.4, h: 1.6 },
    price: 129,
    color: "#c9b98a"
  }
];

/**
 * Live, reconciled catalog. Starts as the static seed list (tagged
 * `source: "static"`) and is mutated in place by `reconcileCatalog` once the
 * API catalog has loaded, so that `getCatalogItem` — used by `sceneStore`
 * when placing furniture — resolves API-only items too without either
 * module needing to know about the other's fetch lifecycle.
 */
let liveCatalog: CatalogItem[] = CATALOG.map((item) => ({ ...item, source: item.source ?? "static" }));
let catalogById: Map<string, CatalogItem> = new Map(liveCatalog.map((item) => [item.id, item]));

/** Look up a catalog entry by its id, or `undefined` if unknown. Reflects the latest reconciled catalog. */
export function getCatalogItem(id: string): CatalogItem | undefined {
  return catalogById.get(id);
}

/** Current reconciled catalog (static seed plus/overridden-by any API items merged in so far). */
export function getLiveCatalog(): CatalogItem[] {
  return liveCatalog;
}

/**
 * Merge API-sourced catalog items into the live catalog, keyed by `id`.
 * Where an id exists in both the static seed and the API response, the API
 * item wins (fresher pricing/description); API items with new ids are
 * appended. Static items with no API counterpart are kept as-is (instant
 * fallback / offline default). Returns the new reconciled list.
 */
export function reconcileCatalog(apiItems: CatalogItem[]): CatalogItem[] {
  const merged = new Map<string, CatalogItem>(CATALOG.map((item) => [item.id, { ...item, source: "static" as const }]));
  for (const item of apiItems) {
    merged.set(item.id, { ...item, source: "api" as const });
  }
  liveCatalog = Array.from(merged.values());
  catalogById = merged;
  return liveCatalog;
}

/** Reset the live catalog back to just the static seed. Exposed for tests. */
export function resetLiveCatalog(): void {
  liveCatalog = CATALOG.map((item) => ({ ...item, source: item.source ?? "static" }));
  catalogById = new Map(liveCatalog.map((item) => [item.id, item]));
}
