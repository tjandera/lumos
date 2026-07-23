/**
 * Pure dynamic-downgrade state machine: if the rolling-average fps
 * (published by the existing `FrameSampler` via `perfStore`) stays under
 * `FPS_THRESHOLD` for `SUSTAIN_MS`, drop the lighting-quality preset one
 * tier, exactly once per session. No GL/DOM here — see `AutoQualityController`
 * for the wiring into `perfStore` / the scene store / the toast.
 */

import type { QualityLevel } from "@interior/renderer";

export const QUALITY_TIERS: QualityLevel[] = ["low", "medium", "high"];
export const AUTO_DOWNGRADE_FPS_THRESHOLD = 40;
export const AUTO_DOWNGRADE_SUSTAIN_MS = 10_000;

export interface AutoDowngradeState {
  /** Wall-clock timestamp (ms) when fps first dropped below threshold in the
   *  current below-threshold run, or null if fps is currently at/above it. */
  belowThresholdSinceMs: number | null;
  /** True once a downgrade has been applied — the machine never fires twice. */
  downgraded: boolean;
}

export const initialAutoDowngradeState: AutoDowngradeState = {
  belowThresholdSinceMs: null,
  downgraded: false
};

export interface AutoDowngradeResult {
  state: AutoDowngradeState;
  /** The quality to downgrade to, or null if no action should be taken. */
  downgradeTo: QualityLevel | null;
}

/**
 * One evaluation step, called on each fps sample. `nowMs` and `fps` are
 * passed in (not read from `Date.now()`/globals) so this stays pure and
 * deterministic in tests.
 */
export function evaluateAutoDowngrade(
  state: AutoDowngradeState,
  fps: number,
  nowMs: number,
  currentQuality: QualityLevel
): AutoDowngradeResult {
  if (state.downgraded) return { state, downgradeTo: null };

  const tierIndex = QUALITY_TIERS.indexOf(currentQuality);
  if (tierIndex <= 0) {
    // Already at the lowest tier — nothing to drop to; stop tracking.
    return { state: { belowThresholdSinceMs: null, downgraded: false }, downgradeTo: null };
  }

  // fps === 0 means "no samples yet" (see FrameSampler) — ignore, don't count
  // it as a bad frame.
  if (fps <= 0 || fps >= AUTO_DOWNGRADE_FPS_THRESHOLD) {
    if (state.belowThresholdSinceMs === null) return { state, downgradeTo: null };
    return { state: { belowThresholdSinceMs: null, downgraded: false }, downgradeTo: null };
  }

  const since = state.belowThresholdSinceMs ?? nowMs;
  const elapsed = nowMs - since;
  if (elapsed >= AUTO_DOWNGRADE_SUSTAIN_MS) {
    return {
      state: { belowThresholdSinceMs: since, downgraded: true },
      downgradeTo: QUALITY_TIERS[tierIndex - 1]!
    };
  }
  return { state: { belowThresholdSinceMs: since, downgraded: false }, downgradeTo: null };
}
