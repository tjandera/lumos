/**
 * Full-room layout planner for `suggestLayout`.
 *
 * Deterministic product selection + relationship constraints. Given a catalog
 * (optionally narrowed by style/budget or an explicit id list), it picks a
 * sensible starter set and expresses their relationships as CONSTRAINTS
 * (sofa nearWall, coffee table centered next to the sofa, armchair facing it,
 * lamp beside it). The solver then places the whole set together. No
 * coordinates are ever invented here.
 */

import type { CatalogItem } from "./catalog.js";
import { filterCatalog, findCatalogItem } from "./catalog.js";
import type { PlacementRequest, SolverConstraints } from "./solver.js";

/** Ordered category "roles" used when auto-selecting a living-room set. */
const DEFAULT_LIVING_ROOM: { category: string; nameHint?: string }[] = [
  { category: "sofa" },
  { category: "table", nameHint: "coffee" },
  { category: "armchair" },
  { category: "lighting" }
];

export interface PlanLayoutInput {
  catalog: CatalogItem[];
  style?: string;
  budget?: number;
  itemCatalogIds?: string[];
  generateId: () => string;
}

/** Pick the cheapest catalog item matching a category (and optional name hint). */
function pickForRole(catalog: CatalogItem[], role: { category: string; nameHint?: string }): CatalogItem | undefined {
  const inCategory = filterCatalog(catalog, { category: role.category });
  const sorted = [...inCategory].sort((a, b) => a.price - b.price || a.id.localeCompare(b.id));
  if (role.nameHint) {
    const hinted = sorted.find((i) => i.name.toLowerCase().includes(role.nameHint as string));
    if (hinted) return hinted;
  }
  return sorted[0];
}

/**
 * Choose the set of catalog items to place. Explicit `itemCatalogIds` win;
 * otherwise a default living-room set is selected, honoring a total `budget`.
 */
function selectItems(input: PlanLayoutInput): CatalogItem[] {
  if (input.itemCatalogIds && input.itemCatalogIds.length > 0) {
    const resolved: CatalogItem[] = [];
    for (const id of input.itemCatalogIds) {
      const item = findCatalogItem(input.catalog, id);
      if (item) resolved.push(item);
    }
    return resolved;
  }

  const chosen: CatalogItem[] = [];
  let spent = 0;
  for (const role of DEFAULT_LIVING_ROOM) {
    const item = pickForRole(input.catalog, role);
    if (!item) continue;
    if (input.budget !== undefined && spent + item.price > input.budget) continue;
    chosen.push(item);
    spent += item.price;
  }
  return chosen;
}

/** Default relationship constraints for an item, given the anchor (usually the sofa/bed). */
function constraintsForCategory(category: string, anchorId: string | undefined): SolverConstraints {
  const cat = category.toLowerCase();
  switch (cat) {
    case "sofa":
    case "bed":
    case "storage":
    case "desk":
      return { nearWall: true };
    case "armchair":
    case "chair":
      return anchorId ? { facingItem: anchorId } : { nearWall: true };
    case "table":
      return anchorId ? { zone: "center", adjacentTo: anchorId } : { zone: "center" };
    case "lighting":
      return anchorId ? { nearWall: true, adjacentTo: anchorId } : { nearWall: true };
    default:
      return { nearWall: true };
  }
}

export interface PlannedLayout {
  requests: PlacementRequest[];
  /** The catalog items chosen, in placement order (for reporting / totals). */
  items: CatalogItem[];
}

/**
 * Turn a `suggestLayout` request into an ordered list of `PlacementRequest`s.
 * The first sofa/bed becomes the anchor other pieces relate to; it is placed
 * first so later constraints can reference it.
 */
export function planLayout(input: PlanLayoutInput): PlannedLayout {
  const items = selectItems(input);

  // Place anchors (sofa/bed) first so relational constraints can reference them.
  const anchorFirst = [...items].sort((a, b) => roleRank(a.category) - roleRank(b.category));

  // Pre-assign ids so constraints can name items placed earlier in the batch.
  const withIds = anchorFirst.map((item) => ({ item, id: input.generateId() }));
  const anchor = withIds.find(({ item }) => item.category === "sofa" || item.category === "bed");

  const requests: PlacementRequest[] = withIds.map(({ item, id }) => ({
    catalogId: item.id,
    itemId: id,
    dimensions: item.dimensions,
    category: item.category,
    constraints:
      anchor && anchor.id === id
        ? { nearWall: true }
        : constraintsForCategory(item.category, anchor?.id),
    isExisting: false
  }));

  return { requests, items: anchorFirst };
}

/** Sort key: anchors (sofa/bed) first, then everything else in a stable order. */
function roleRank(category: string): number {
  const cat = category.toLowerCase();
  if (cat === "sofa" || cat === "bed") return 0;
  if (cat === "storage" || cat === "desk") return 1;
  if (cat === "table") return 2;
  if (cat === "armchair" || cat === "chair") return 3;
  return 4;
}
