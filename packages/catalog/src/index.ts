export type CatalogCategory = 'seating' | 'tables' | 'storage' | 'beds' | 'lighting' | 'decor';

export interface CatalogItem {
  id: string;
  name: string;
  category: CatalogCategory;
  /** real-world dimensions in meters (authoritative for placement + collision) */
  width: number;
  height: number;
  depth: number;
  /** placeholder box color, shown while the model loads or if it's missing */
  color: string;
  /** GLB model served from /public/models; auto-scaled to `width`. */
  model?: string;
}

/**
 * The curated catalog. Models are Kenney "Furniture Kit 2.0" (CC0) GLBs — see
 * LICENSES.md. Dimensions are real-world meters; the renderer scales each model to
 * match, and falls back to a colored box while a model loads.
 */
export const catalog: CatalogItem[] = [
  { id: 'sofa-2seat', name: '2-Seat Sofa', category: 'seating', width: 1.6, height: 0.8, depth: 0.85, color: '#8a6f52', model: '/models/sofa-2seat.glb' },
  { id: 'armchair', name: 'Armchair', category: 'seating', width: 0.85, height: 0.85, depth: 0.85, color: '#9a7b5a', model: '/models/armchair.glb' },
  { id: 'bench', name: 'Bench', category: 'seating', width: 1.2, height: 0.45, depth: 0.4, color: '#8a6f52', model: '/models/bench.glb' },
  { id: 'desk-chair', name: 'Desk Chair', category: 'seating', width: 0.55, height: 0.95, depth: 0.55, color: '#4b5563', model: '/models/desk-chair.glb' },
  { id: 'coffee-table', name: 'Coffee Table', category: 'tables', width: 1.1, height: 0.4, depth: 0.6, color: '#6b7280', model: '/models/coffee-table.glb' },
  { id: 'dining-table', name: 'Dining Table', category: 'tables', width: 1.6, height: 0.75, depth: 0.9, color: '#7c5f45', model: '/models/dining-table.glb' },
  { id: 'side-table', name: 'Side Table', category: 'tables', width: 0.5, height: 0.55, depth: 0.5, color: '#7c5f45', model: '/models/side-table.glb' },
  { id: 'desk', name: 'Desk', category: 'tables', width: 1.2, height: 0.75, depth: 0.6, color: '#7c5f45', model: '/models/desk.glb' },
  { id: 'bed-double', name: 'Double Bed', category: 'beds', width: 1.6, height: 0.5, depth: 2.0, color: '#5f6b7a', model: '/models/bed-double.glb' },
  { id: 'bookshelf', name: 'Bookshelf', category: 'storage', width: 0.9, height: 1.8, depth: 0.35, color: '#6d5741', model: '/models/bookshelf.glb' },
  { id: 'tv-stand', name: 'TV Stand', category: 'storage', width: 1.4, height: 0.5, depth: 0.4, color: '#4b4640', model: '/models/tv-stand.glb' },
  { id: 'floor-lamp', name: 'Floor Lamp', category: 'lighting', width: 0.4, height: 1.6, depth: 0.4, color: '#c9b48a', model: '/models/floor-lamp.glb' },
  { id: 'plant', name: 'Potted Plant', category: 'decor', width: 0.5, height: 0.9, depth: 0.5, color: '#4a7c59', model: '/models/plant.glb' },
  { id: 'rug', name: 'Rug', category: 'decor', width: 2.0, height: 0.02, depth: 1.4, color: '#94745a', model: '/models/rug.glb' },

  // Second batch — same Kenney Furniture Kit 2.0 (CC0) pack, more variety.
  { id: 'sofa-3seat', name: '3-Seat Sofa', category: 'seating', width: 2.0, height: 0.8, depth: 0.9, color: '#8a6f52', model: '/models/sofa-3seat.glb' },
  { id: 'lounge-chair', name: 'Lounge Chair', category: 'seating', width: 0.75, height: 0.8, depth: 0.8, color: '#9a7b5a', model: '/models/lounge-chair.glb' },
  { id: 'bar-stool', name: 'Bar Stool', category: 'seating', width: 0.35, height: 0.75, depth: 0.35, color: '#4b5563', model: '/models/bar-stool.glb' },
  { id: 'round-table', name: 'Round Table', category: 'tables', width: 1.1, height: 0.75, depth: 1.1, color: '#7c5f45', model: '/models/round-table.glb' },
  { id: 'corner-desk', name: 'Corner Desk', category: 'tables', width: 1.3, height: 0.75, depth: 1.3, color: '#7c5f45', model: '/models/corner-desk.glb' },
  { id: 'wardrobe', name: 'Wardrobe', category: 'storage', width: 1.0, height: 2.0, depth: 0.6, color: '#6d5741', model: '/models/wardrobe.glb' },
  { id: 'bed-single', name: 'Single Bed', category: 'beds', width: 1.0, height: 0.5, depth: 2.0, color: '#5f6b7a', model: '/models/bed-single.glb' },
  { id: 'plant-small', name: 'Small Plant', category: 'decor', width: 0.35, height: 0.5, depth: 0.35, color: '#4a7c59', model: '/models/plant-small.glb' },
  { id: 'rug-round', name: 'Round Rug', category: 'decor', width: 1.6, height: 0.02, depth: 1.6, color: '#94745a', model: '/models/rug-round.glb' },
  { id: 'coat-rack', name: 'Coat Rack', category: 'decor', width: 0.4, height: 1.75, depth: 0.4, color: '#4b4640', model: '/models/coat-rack.glb' },
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
