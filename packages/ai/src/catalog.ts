/**
 * Catalog types + pure filter/shortlist helpers used by the AI layer.
 *
 * The AI package deliberately does NOT depend on `apps/api` (packages must not
 * depend on apps). Instead it declares a structurally-compatible `CatalogItem`
 * shape — the API's `CatalogItem` (whose `category` is a string union) is
 * assignable to this one, so the API can hand its catalog straight to the AI
 * executor/loop.
 *
 * Shopping follows the plan's rule: DB-filter FIRST (dimensions, budget,
 * category — deterministic, never invents SKUs), THEN the LLM ranks/explains
 * the shortlist. The filtering here is the "DB filter" half.
 */

import type { Dimensions3D } from "@interior/core";

/** Known furniture categories. Kept loose (`string`) so it stays compatible
 * with the API catalog's stricter union without a cross-package import. */
export type CatalogCategory = string;

export interface CatalogItem {
  id: string;
  name: string;
  category: CatalogCategory;
  dimensions: Dimensions3D;
  price: number;
  color: string;
  description: string;
}

/** Categories whose fronts need a walkway/clearance zone kept clear. */
const SEATING_CATEGORIES = new Set(["sofa", "armchair", "chair", "bed"]);

/** Whether a category should have a front-clearance zone enforced by the solver. */
export function needsFrontClearance(category: string): boolean {
  return SEATING_CATEGORIES.has(category.toLowerCase());
}

export interface CatalogFilter {
  category?: string;
  /** Case-insensitive substring match against the item name. */
  q?: string;
  maxWidth?: number;
  maxDepth?: number;
  maxHeight?: number;
  /** Per-item price ceiling. */
  maxPrice?: number;
}

/**
 * Deterministic "DB filter" over the catalog: category, name substring,
 * fits-in-space max dimensions, and a per-item price ceiling. Invalid numeric
 * bounds are treated as "no bound" (a malformed filter degrades to no filter
 * rather than throwing). Output preserves input order.
 */
export function filterCatalog(items: CatalogItem[], filter: CatalogFilter = {}): CatalogItem[] {
  const category = filter.category?.toLowerCase();
  const search = filter.q?.toLowerCase().trim();
  const maxWidth = positive(filter.maxWidth);
  const maxDepth = positive(filter.maxDepth);
  const maxHeight = positive(filter.maxHeight);
  const maxPrice = positive(filter.maxPrice);

  return items.filter((item) => {
    if (category && item.category.toLowerCase() !== category) return false;
    if (search && !item.name.toLowerCase().includes(search)) return false;
    if (maxWidth !== undefined && item.dimensions.w > maxWidth) return false;
    if (maxDepth !== undefined && item.dimensions.d > maxDepth) return false;
    if (maxHeight !== undefined && item.dimensions.h > maxHeight) return false;
    if (maxPrice !== undefined && item.price > maxPrice) return false;
    return true;
  });
}

/** Look up a catalog item by id. */
export function findCatalogItem(items: CatalogItem[], id: string): CatalogItem | undefined {
  return items.find((item) => item.id === id);
}

function positive(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}
