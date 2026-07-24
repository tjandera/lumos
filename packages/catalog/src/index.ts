export type CatalogCategory = 'seating' | 'tables' | 'storage' | 'beds' | 'decor';

export interface CatalogItem {
  id: string;
  name: string;
  category: CatalogCategory;
  /** real-world dimensions in meters */
  width: number;
  height: number;
  depth: number;
  /** placeholder box color until real GLB models land */
  color: string;
}

/**
 * The curated seed catalog. Dimensions are real-world meters so placement,
 * collision, and "fits-through-door" checks are meaningful now; the GLB models
 * these stand in for are sourced in a later step. Keep in sync with
 * catalog/manifest.json and LICENSES.md.
 */
export const catalog: CatalogItem[] = [
  { id: 'sofa-2seat', name: '2-Seat Sofa', category: 'seating', width: 1.6, height: 0.8, depth: 0.85, color: '#8a6f52' },
  { id: 'armchair', name: 'Armchair', category: 'seating', width: 0.85, height: 0.85, depth: 0.85, color: '#9a7b5a' },
  { id: 'coffee-table', name: 'Coffee Table', category: 'tables', width: 1.1, height: 0.4, depth: 0.6, color: '#6b7280' },
  { id: 'dining-table', name: 'Dining Table', category: 'tables', width: 1.6, height: 0.75, depth: 0.9, color: '#7c5f45' },
  { id: 'bed-double', name: 'Double Bed', category: 'beds', width: 1.6, height: 0.5, depth: 2.0, color: '#5f6b7a' },
  { id: 'bookshelf', name: 'Bookshelf', category: 'storage', width: 0.9, height: 1.8, depth: 0.35, color: '#6d5741' },
  { id: 'rug', name: 'Rug', category: 'decor', width: 2.0, height: 0.02, depth: 1.4, color: '#94745a' },
];

const byId = new Map(catalog.map((c) => [c.id, c]));

export function getCatalogItem(id: string): CatalogItem | undefined {
  return byId.get(id);
}

/** Fallback so an unknown catalogId still renders something sensible. */
export const DEFAULT_ITEM: CatalogItem = {
  id: 'unknown',
  name: 'Unknown',
  category: 'decor',
  width: 0.6,
  height: 0.6,
  depth: 0.6,
  color: '#888888',
};
