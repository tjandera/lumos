/**
 * Small formatting/label helpers shared by the panels that were reworked for
 * plain-language, beginner-friendly copy (LightingPanel, PropertiesPanel,
 * CatalogPanel). Kept framework-free so they're trivial to unit test.
 */

/** Plain-language width × depth, e.g. `W 2.10 × D 0.90 m` (catalog cards). */
export function formatDimsPlain(dimensions: { w: number; d: number; h: number }): string {
  return `W ${dimensions.w.toFixed(2)} × D ${dimensions.d.toFixed(2)} m`;
}

/** Full width × depth × height, e.g. `2.10 × 0.90 × 0.75 m` (tooltips). */
export function formatDimsFull(dimensions: { w: number; d: number; h: number }): string {
  return `${dimensions.w.toFixed(2)} × ${dimensions.d.toFixed(2)} × ${dimensions.h.toFixed(2)} m`;
}

/** Meters -> whole centimeters for "typical value" style hints (e.g. wall thickness). */
export function metersToCm(value: number): number {
  return Math.round(value * 100);
}
