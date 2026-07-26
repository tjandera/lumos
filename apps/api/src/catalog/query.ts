import type { CatalogItem, CatalogCategory } from "./types.js";

export interface CatalogQuery {
  category?: string;
  q?: string;
  maxWidth?: string;
  maxDepth?: string;
  maxHeight?: string;
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Filter the catalog by category, a case-insensitive name substring search,
 * and/or "fits in space" max dimension bounds. Unknown/invalid numeric
 * params are ignored rather than rejected, so a malformed query degrades to
 * "no filter" instead of an error.
 */
export function filterCatalog(items: CatalogItem[], query: CatalogQuery): CatalogItem[] {
  const category = query.category?.toLowerCase();
  const search = query.q?.toLowerCase().trim();
  const maxWidth = parsePositiveNumber(query.maxWidth);
  const maxDepth = parsePositiveNumber(query.maxDepth);
  const maxHeight = parsePositiveNumber(query.maxHeight);

  return items.filter((item) => {
    if (category && item.category !== (category as CatalogCategory)) return false;
    if (search && !item.name.toLowerCase().includes(search)) return false;
    if (maxWidth !== undefined && item.dimensions.w > maxWidth) return false;
    if (maxDepth !== undefined && item.dimensions.d > maxDepth) return false;
    if (maxHeight !== undefined && item.dimensions.h > maxHeight) return false;
    return true;
  });
}
