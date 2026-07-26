/**
 * Perf budget constants + pure budget-check helpers for the 3D view.
 * Target: 60fps on a mid-range laptop with shadows + SSAO (see
 * IMPLEMENTATION_PLAN.md "Retrofit backlog").
 */

export const PERF_BUDGET = {
  targetFps: 60,
  /** Below this rolling-average fps, the HUD flags the frame-time line red. */
  minAcceptableFps: 50,
  maxDrawCalls: 300,
  maxTriangles: 500_000,
  maxGeometries: 400,
  maxTextures: 150
} as const;

export interface RendererCounters {
  fps: number;
  worstFrameFps: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

export interface BudgetStatus {
  fpsOver: boolean;
  drawCallsOver: boolean;
  trianglesOver: boolean;
  geometriesOver: boolean;
  texturesOver: boolean;
  anyOver: boolean;
}

/** Pure check of a counters snapshot against the perf budget. No GL/DOM. */
export function checkBudget(counters: RendererCounters): BudgetStatus {
  const fpsOver = counters.fps < PERF_BUDGET.minAcceptableFps;
  const drawCallsOver = counters.drawCalls > PERF_BUDGET.maxDrawCalls;
  const trianglesOver = counters.triangles > PERF_BUDGET.maxTriangles;
  const geometriesOver = counters.geometries > PERF_BUDGET.maxGeometries;
  const texturesOver = counters.textures > PERF_BUDGET.maxTextures;
  return {
    fpsOver,
    drawCallsOver,
    trianglesOver,
    geometriesOver,
    texturesOver,
    anyOver: fpsOver || drawCallsOver || trianglesOver || geometriesOver || texturesOver
  };
}
