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
 * The curated catalog. Models are CC0 GLBs, mostly Poly Haven with some of the original
 * Kenney "Furniture Kit 2.0" set still in place — see LICENSES.md for per-asset
 * provenance. Dimensions are real-world meters; the renderer contain-fits each model to
 * match, and falls back to a colored box while a model loads.
 */
export const catalog: CatalogItem[] = [
  { id: 'sofa-2seat', name: '2-Seat Sofa', category: 'seating', width: 1.6, height: 0.8, depth: 0.85, color: '#8a6f52', model: '/models/ph/Sofa_01.glb' },
  { id: 'armchair', name: 'Armchair', category: 'seating', width: 0.85, height: 0.85, depth: 0.85, color: '#9a7b5a', model: '/models/ph/ArmChair_01.glb' },
  { id: 'bench', name: 'Bench', category: 'seating', width: 1.2, height: 0.45, depth: 0.4, color: '#8a6f52', model: '/models/ph/painted_wooden_bench.glb' },
  { id: 'desk-chair', name: 'Desk Chair', category: 'seating', width: 0.55, height: 0.95, depth: 0.55, color: '#4b5563', model: '/models/ph/dining_chair_02.glb' },
  { id: 'coffee-table', name: 'Coffee Table', category: 'tables', width: 1.1, height: 0.4, depth: 0.6, color: '#6b7280', model: '/models/ph/modern_coffee_table_01.glb' },
  { id: 'dining-table', name: 'Dining Table', category: 'tables', width: 1.6, height: 0.75, depth: 0.9, color: '#7c5f45', model: '/models/ph/dining_table.glb' },
  { id: 'side-table', name: 'Side Table', category: 'tables', width: 0.5, height: 0.55, depth: 0.5, color: '#7c5f45', model: '/models/ph/side_table_01.glb' },
  { id: 'desk', name: 'Desk', category: 'tables', width: 1.2, height: 0.75, depth: 0.6, color: '#7c5f45', model: '/models/ph/metal_office_desk.glb' },
  { id: 'bed-double', name: 'Double Bed', category: 'beds', width: 1.6, height: 0.5, depth: 2.0, color: '#5f6b7a', model: '/models/bed-double.glb' },
  { id: 'bookshelf', name: 'Bookshelf', category: 'storage', width: 0.9, height: 1.8, depth: 0.35, color: '#6d5741', model: '/models/ph/wooden_bookshelf_worn.glb' },
  { id: 'tv-stand', name: 'TV Stand', category: 'storage', width: 1.4, height: 0.5, depth: 0.4, color: '#4b4640', model: '/models/ph/modern_wooden_cabinet.glb' },
  { id: 'floor-lamp', name: 'Floor Lamp', category: 'lighting', width: 0.4, height: 1.6, depth: 0.4, color: '#c9b48a', model: '/models/ph/desk_lamp_arm_01.glb' },
  { id: 'plant', name: 'Potted Plant', category: 'decor', width: 0.5, height: 0.9, depth: 0.5, color: '#4a7c59', model: '/models/ph/potted_plant_01.glb' },
  { id: 'rug', name: 'Rug', category: 'decor', width: 2.0, height: 0.02, depth: 1.4, color: '#94745a', model: '/models/rug.glb' },

  // Second batch — same Kenney Furniture Kit 2.0 (CC0) pack, more variety.
  { id: 'sofa-3seat', name: '3-Seat Sofa', category: 'seating', width: 2.0, height: 0.8, depth: 0.9, color: '#8a6f52', model: '/models/ph/Sofa_01.glb' },
  { id: 'lounge-chair', name: 'Lounge Chair', category: 'seating', width: 0.75, height: 0.8, depth: 0.8, color: '#9a7b5a', model: '/models/ph/mid_century_lounge_chair.glb' },
  { id: 'bar-stool', name: 'Bar Stool', category: 'seating', width: 0.35, height: 0.75, depth: 0.35, color: '#4b5563', model: '/models/ph/bar_chair_round_01.glb' },
  { id: 'round-table', name: 'Round Table', category: 'tables', width: 1.1, height: 0.75, depth: 1.1, color: '#7c5f45', model: '/models/ph/round_wooden_table_01.glb' },
  { id: 'corner-desk', name: 'Corner Desk', category: 'tables', width: 1.3, height: 0.75, depth: 1.3, color: '#7c5f45', model: '/models/ph/metal_office_desk.glb' },
  { id: 'wardrobe', name: 'Wardrobe', category: 'storage', width: 1.0, height: 2.0, depth: 0.6, color: '#6d5741', model: '/models/ph/painted_wooden_cabinet.glb' },
  { id: 'bed-single', name: 'Single Bed', category: 'beds', width: 1.0, height: 0.5, depth: 2.0, color: '#5f6b7a', model: '/models/ph/vintage_day_bed.glb' },
  { id: 'plant-small', name: 'Small Plant', category: 'decor', width: 0.35, height: 0.5, depth: 0.35, color: '#4a7c59', model: '/models/ph/potted_plant_02.glb' },
  { id: 'rug-round', name: 'Round Rug', category: 'decor', width: 1.6, height: 0.02, depth: 1.6, color: '#94745a', model: '/models/rug-round.glb' },
  { id: 'coat-rack', name: 'Coat Rack', category: 'decor', width: 0.4, height: 1.75, depth: 0.4, color: '#4b4640', model: '/models/coat-rack.glb' },

  // --- Added from the Poly Haven CC0 set (see LICENSES.md) ---
  { id: 'ottoman', name: 'Ottoman', category: 'seating', width: 0.6, height: 0.42, depth: 0.6, color: '#8a6f52', model: '/models/ph/Ottoman_01.glb' },
  { id: 'rocking-chair', name: 'Rocking Chair', category: 'seating', width: 0.65, height: 1.05, depth: 0.9, color: '#7c5f45', model: '/models/ph/Rockingchair_01.glb' },
  { id: 'wooden-chair', name: 'Wooden Chair', category: 'seating', width: 0.45, height: 0.9, depth: 0.5, color: '#7c5f45', model: '/models/ph/WoodenChair_01.glb' },
  { id: 'round-coffee-table', name: 'Round Coffee Table', category: 'tables', width: 0.8, height: 0.42, depth: 0.8, color: '#6b7280', model: '/models/ph/coffee_table_round_01.glb' },
  { id: 'nightstand', name: 'Nightstand', category: 'storage', width: 0.45, height: 0.6, depth: 0.4, color: '#6d5741', model: '/models/ph/ClassicNightstand_01.glb' },
  { id: 'console-table', name: 'Console Table', category: 'tables', width: 1.1, height: 0.8, depth: 0.35, color: '#7c5f45', model: '/models/ph/ClassicConsole_01.glb' },
  { id: 'wall-shelf', name: 'Wall Shelf', category: 'storage', width: 0.8, height: 0.3, depth: 0.25, color: '#6d5741', model: '/models/ph/Shelf_01.glb' },
  { id: 'steel-shelves', name: 'Steel Shelving', category: 'storage', width: 1.0, height: 1.8, depth: 0.45, color: '#5a5f66', model: '/models/ph/steel_frame_shelves_01.glb' },
  { id: 'ceiling-lamp', name: 'Ceiling Lamp', category: 'lighting', width: 0.35, height: 0.4, depth: 0.35, color: '#c9b48a', model: '/models/ph/modern_ceiling_lamp_01.glb' },
  { id: 'vase', name: 'Vase', category: 'decor', width: 0.18, height: 0.3, depth: 0.18, color: '#b9a884', model: '/models/ph/ceramic_vase_01.glb' },
  { id: 'plant-tall', name: 'Tall Plant', category: 'decor', width: 0.6, height: 1.4, depth: 0.6, color: '#4a7c59', model: '/models/ph/potted_plant_04.glb' },
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
