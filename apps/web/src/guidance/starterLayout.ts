/**
 * "Arrange for me" one-click starter layouts — for beginners who don't want
 * to place furniture piece by piece. Runs entirely client-side: uses
 * `@interior/ai`'s deterministic `planLayout` (choose + relate a starter set)
 * and `solve` (turn those into validated, collision-free positions) against
 * the app's static catalog. No server round-trip.
 *
 * All successfully solved placements are applied via the store's `batch()`
 * as a single undo step, so "Arrange for me" is one Ctrl+Z away from a blank
 * room. Anything the solver couldn't place is surfaced as a plain-language
 * failure message rather than silently dropped.
 */

import { planLayout, solve, type CatalogItem as AiCatalogItem } from "@interior/ai";
import { addFurniture, addLampLight, createLampLight, type FurnitureItem, type Room, type SceneDocument } from "@interior/core";
import { generateId } from "../editor/roomOps";
import { getCatalogItem, getLiveCatalog, type CatalogItem as WebCatalogItem } from "../catalog/catalogData";

export type RoomType = "living" | "bedroom" | "dining";

interface RoomTypeSpec {
  label: string;
  /** Web catalog ids, possibly repeated (e.g. 4x dining chair), in placement order. */
  itemIds: string[];
}

const ROOM_TYPE_SPECS: Record<RoomType, RoomTypeSpec> = {
  living: { label: "Living room", itemIds: ["sofa-3seat", "coffee-table", "armchair", "floor-lamp"] },
  bedroom: { label: "Bedroom", itemIds: ["bed-double", "wardrobe", "floor-lamp"] },
  dining: { label: "Dining", itemIds: ["dining-table", "dining-chair", "dining-chair", "dining-chair", "dining-chair"] }
};

export const ROOM_TYPE_OPTIONS: { value: RoomType; label: string }[] = (
  Object.keys(ROOM_TYPE_SPECS) as RoomType[]
).map((value) => ({ value, label: ROOM_TYPE_SPECS[value]!.label }));

/**
 * Translate a web catalog category/name into the category vocabulary
 * `@interior/ai`'s `planLayout` reasons about (sofa/armchair/chair/table/
 * bed/storage/desk/lighting) so its relational constraints (facing,
 * adjacency, centering) apply sensibly. Purely a local mapping for this
 * translation step — the web catalog itself is untouched.
 */
function toAiCategory(webItem: WebCatalogItem): string {
  const cat = webItem.category.toLowerCase();
  const name = webItem.name.toLowerCase();
  if (name.includes("sofa")) return "sofa";
  if (name.includes("armchair")) return "armchair";
  if (cat.includes("seat") || name.includes("chair")) return "chair";
  if (cat.includes("bed") || name.includes("bed")) return "bed";
  if (cat.includes("table")) return "table";
  if (cat.includes("storage")) return "storage";
  if (cat.includes("desk")) return "desk";
  if (cat.includes("lighting")) return "lighting";
  return cat;
}

function toAiCatalog(webCatalog: WebCatalogItem[]): AiCatalogItem[] {
  return webCatalog.map((item) => ({
    id: item.id,
    name: item.name,
    category: toAiCategory(item),
    dimensions: item.dimensions,
    price: item.price,
    color: item.color,
    description: item.description ?? item.name
  }));
}

export interface StarterLayoutResult {
  applied: boolean;
  placedCount: number;
  /** Plain-language explanations for anything the solver could not place. */
  failures: string[];
}

/**
 * Plan + solve a starter layout for `roomType` against `room`, and apply
 * every successfully solved placement via `batch` as ONE undo step. Adds to
 * the room — existing furniture is treated as fixed obstacles, never moved
 * or removed.
 */
export function arrangeForMe(
  roomType: RoomType,
  document: SceneDocument,
  room: Room | undefined,
  batch: (label: string, mutate: (doc: SceneDocument) => SceneDocument) => SceneDocument
): StarterLayoutResult {
  const spec = ROOM_TYPE_SPECS[roomType];
  const aiCatalog = toAiCatalog(getLiveCatalog());

  const plan = planLayout({
    catalog: aiCatalog,
    itemCatalogIds: spec.itemIds,
    generateId: () => generateId("furn")
  });

  if (plan.requests.length === 0) {
    return { applied: false, placedCount: 0, failures: ["Couldn't find the starter pieces for this room type in the catalog."] };
  }

  const result = solve(document, room, plan.requests);

  if (result.placed.length === 0) {
    return { applied: false, placedCount: 0, failures: result.failed.map((f) => f.message) };
  }

  batch(`arrangeForMe:${roomType}`, (doc) => {
    let next = doc;
    for (const placement of result.placed) {
      const catalogItem = getCatalogItem(placement.catalogId);
      const item: FurnitureItem = {
        id: placement.itemId,
        catalogId: placement.catalogId,
        position: placement.position,
        rotationY: placement.rotationY,
        dimensions: placement.dimensions
      };
      next = addFurniture(next, item);
      if (catalogItem?.category === "lighting") {
        next = addLampLight(next, createLampLight(generateId("lamp"), item.id));
      }
    }
    return next;
  });

  return {
    applied: true,
    placedCount: result.placed.length,
    failures: result.failed.map((f) => f.message)
  };
}
