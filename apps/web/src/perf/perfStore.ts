/**
 * Tiny external pub-sub store carrying the latest renderer counters from the
 * `useFrame` sampler (inside the R3F `Canvas`) out to the DOM-overlay
 * `PerfHud` (outside the `Canvas`), without triggering React re-renders of
 * the 3D scene itself. Pure/testable without GL — the sampler just calls
 * `setPerfCounters` with plain numbers.
 */

import type { RendererCounters } from "./budget";

export type PerfListener = () => void;

const EMPTY_COUNTERS: RendererCounters = {
  fps: 0,
  worstFrameFps: 0,
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0
};

let counters: RendererCounters = EMPTY_COUNTERS;
const listeners = new Set<PerfListener>();

export function setPerfCounters(next: RendererCounters): void {
  counters = next;
  for (const l of listeners) l();
}

export function getPerfCounters(): RendererCounters {
  return counters;
}

export function subscribePerfCounters(listener: PerfListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test/dev helper: reset to the zeroed default snapshot. */
export function resetPerfCounters(): void {
  setPerfCounters(EMPTY_COUNTERS);
}
