/**
 * Pure bidirectional quality-adjustment state machine: step the render-quality tier
 * down when FPS stays under the floor for a while, and back up when there's been
 * comfortable headroom for a good while — so the app holds inside a roughly 30–60fps
 * band on whatever hardware it's running on, without anyone having to hand-pick a
 * quality preset. No DOM/store access here — see QualityGovernor.tsx for the wiring
 * into `usePerf` / `uiStore`.
 *
 * Modeled on the same shape as the earlier one-way-only autoQuality.ts (see
 * apps/web/src/perf/), extended to also step back up, with hysteresis between the two
 * thresholds and a cooldown after every change so the two directions can't fight.
 */

export type Quality = 'low' | 'med' | 'high';

const TIERS: Quality[] = ['low', 'med', 'high'];

/** Sustained below this -> step down. Comfortably under the 30fps floor asked for, so
 * a downgrade only fires once things are genuinely rough, not on every dip. */
export const LOW_FPS_THRESHOLD = 28;
/** Sustained above this -> step up. Leaves headroom under the 60fps ceiling rather
 * than upgrading the instant 60 is technically cleared. */
export const HIGH_FPS_THRESHOLD = 55;

/** React fairly quickly to a real slowdown — a stuttering scene is the more painful
 * failure mode. */
export const DOWNGRADE_SUSTAIN_MS = 4_000;
/** Be far more patient before spending more of the frame budget — avoids the classic
 * adaptive-quality flap of upgrading, immediately re-triggering a downgrade, forever. */
export const UPGRADE_SUSTAIN_MS = 15_000;
/** After any change, stop judging FPS for a bit — a quality switch itself (new shadow
 * map size, AO sample count) can cause a brief hitch that shouldn't count against it. */
export const POST_CHANGE_COOLDOWN_MS = 5_000;

export interface GovernorState {
  belowSinceMs: number | null;
  aboveSinceMs: number | null;
  lastChangeMs: number | null;
}

export const initialGovernorState: GovernorState = {
  belowSinceMs: null,
  aboveSinceMs: null,
  lastChangeMs: null,
};

export interface GovernorResult {
  state: GovernorState;
  /** The quality to switch to, or null if nothing should change this sample. */
  changeTo: Quality | null;
}

/**
 * One evaluation step, called on each fps sample. `nowMs` and `fps` are passed in
 * (not read from `Date.now()`/globals) so this stays pure and deterministic in tests.
 */
export function evaluateQualityGovernor(
  state: GovernorState,
  fps: number,
  nowMs: number,
  currentQuality: Quality,
): GovernorResult {
  if (state.lastChangeMs !== null && nowMs - state.lastChangeMs < POST_CHANGE_COOLDOWN_MS) {
    return { state, changeTo: null };
  }

  // fps <= 0 means "no sample yet" (tab just gained focus, assets still loading) —
  // don't count it as good or bad, but don't cancel an otherwise-sustained trend over
  // one missed reading either.
  if (fps <= 0) {
    return { state, changeTo: null };
  }

  const tierIndex = TIERS.indexOf(currentQuality);
  const belowSinceMs = fps < LOW_FPS_THRESHOLD ? (state.belowSinceMs ?? nowMs) : null;
  const aboveSinceMs = fps > HIGH_FPS_THRESHOLD ? (state.aboveSinceMs ?? nowMs) : null;

  if (tierIndex > 0 && belowSinceMs !== null && nowMs - belowSinceMs >= DOWNGRADE_SUSTAIN_MS) {
    return {
      state: { belowSinceMs: null, aboveSinceMs: null, lastChangeMs: nowMs },
      changeTo: TIERS[tierIndex - 1]!,
    };
  }

  if (tierIndex < TIERS.length - 1 && aboveSinceMs !== null && nowMs - aboveSinceMs >= UPGRADE_SUSTAIN_MS) {
    return {
      state: { belowSinceMs: null, aboveSinceMs: null, lastChangeMs: nowMs },
      changeTo: TIERS[tierIndex + 1]!,
    };
  }

  return { state: { belowSinceMs, aboveSinceMs, lastChangeMs: state.lastChangeMs }, changeTo: null };
}
