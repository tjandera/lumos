import { describe, expect, it } from 'vitest';
import {
  DOWNGRADE_SUSTAIN_MS,
  HIGH_FPS_THRESHOLD,
  LOW_FPS_THRESHOLD,
  POST_CHANGE_COOLDOWN_MS,
  UPGRADE_SUSTAIN_MS,
  evaluateQualityGovernor,
  initialGovernorState,
  type GovernorState,
} from './qualityAdaptation';

const T0 = 1_000_000;

describe('evaluateQualityGovernor', () => {
  it('does nothing in the comfortable middle band', () => {
    const r = evaluateQualityGovernor(initialGovernorState, 40, T0, 'med');
    expect(r.changeTo).toBeNull();
  });

  it('ignores fps<=0 samples without cancelling a trend already in progress', () => {
    let state: GovernorState = initialGovernorState;
    let r = evaluateQualityGovernor(state, LOW_FPS_THRESHOLD - 1, T0, 'high');
    state = r.state;
    expect(state.belowSinceMs).toBe(T0);

    r = evaluateQualityGovernor(state, 0, T0 + 1000, 'high');
    expect(r.changeTo).toBeNull();
    expect(r.state.belowSinceMs).toBe(T0); // untouched, not reset

    r = evaluateQualityGovernor(r.state, LOW_FPS_THRESHOLD - 1, T0 + DOWNGRADE_SUSTAIN_MS, 'high');
    expect(r.changeTo).toBe('med');
  });

  it('does not downgrade until the drop has been sustained for the full window', () => {
    let state: GovernorState = initialGovernorState;
    let r = evaluateQualityGovernor(state, 10, T0, 'high');
    state = r.state;
    expect(r.changeTo).toBeNull();

    r = evaluateQualityGovernor(state, 10, T0 + DOWNGRADE_SUSTAIN_MS - 1, 'high');
    expect(r.changeTo).toBeNull();
  });

  it('downgrades exactly one tier once sustained', () => {
    let state: GovernorState = initialGovernorState;
    let r = evaluateQualityGovernor(state, 10, T0, 'high');
    state = r.state;

    r = evaluateQualityGovernor(state, 10, T0 + DOWNGRADE_SUSTAIN_MS, 'high');
    expect(r.changeTo).toBe('med');
    expect(r.state.lastChangeMs).toBe(T0 + DOWNGRADE_SUSTAIN_MS);
  });

  it('is a no-op at the lowest tier — nothing left to drop to', () => {
    const r = evaluateQualityGovernor(initialGovernorState, 10, T0 + DOWNGRADE_SUSTAIN_MS, 'low');
    expect(r.changeTo).toBeNull();
  });

  it('upgrades exactly one tier once headroom is sustained for the (longer) window', () => {
    let state: GovernorState = initialGovernorState;
    let r = evaluateQualityGovernor(state, HIGH_FPS_THRESHOLD + 5, T0, 'med');
    state = r.state;
    expect(r.changeTo).toBeNull();

    r = evaluateQualityGovernor(state, HIGH_FPS_THRESHOLD + 5, T0 + UPGRADE_SUSTAIN_MS - 1, 'med');
    expect(r.changeTo).toBeNull();

    r = evaluateQualityGovernor(r.state, HIGH_FPS_THRESHOLD + 5, T0 + UPGRADE_SUSTAIN_MS, 'med');
    expect(r.changeTo).toBe('high');
  });

  it('is a no-op at the highest tier — nothing left to upgrade to', () => {
    const r = evaluateQualityGovernor(initialGovernorState, 60, T0 + UPGRADE_SUSTAIN_MS, 'high');
    expect(r.changeTo).toBeNull();
  });

  it('resets the below-timer if fps recovers before the downgrade window elapses', () => {
    let state: GovernorState = initialGovernorState;
    let r = evaluateQualityGovernor(state, 10, T0, 'high');
    state = r.state;
    expect(state.belowSinceMs).toBe(T0);

    r = evaluateQualityGovernor(state, 45, T0 + 1000, 'high');
    state = r.state;
    expect(state.belowSinceMs).toBeNull();

    r = evaluateQualityGovernor(state, 10, T0 + 1000 + DOWNGRADE_SUSTAIN_MS - 1, 'high');
    expect(r.changeTo).toBeNull();
  });

  it('never downgrades and upgrades on the same sample even if both windows are met', () => {
    // Sanity: below/above are mutually exclusive by construction (a single fps value
    // can't be both under 28 and over 55), so this is really asserting the thresholds
    // don't overlap.
    expect(LOW_FPS_THRESHOLD).toBeLessThan(HIGH_FPS_THRESHOLD);
  });

  it('suppresses further evaluation during the post-change cooldown', () => {
    let state: GovernorState = initialGovernorState;
    let r = evaluateQualityGovernor(state, 10, T0, 'high');
    state = r.state;
    r = evaluateQualityGovernor(state, 10, T0 + DOWNGRADE_SUSTAIN_MS, 'high');
    expect(r.changeTo).toBe('med');
    state = r.state;

    // Even a terrible fps sample right after the change shouldn't start a new timer
    // yet — still inside the cooldown window.
    r = evaluateQualityGovernor(state, 5, T0 + DOWNGRADE_SUSTAIN_MS + POST_CHANGE_COOLDOWN_MS - 1, 'med');
    expect(r.changeTo).toBeNull();
    expect(r.state).toEqual(state); // state is untouched, not just changeTo

    // Once the cooldown has elapsed, evaluation resumes normally.
    r = evaluateQualityGovernor(state, 10, T0 + DOWNGRADE_SUSTAIN_MS + POST_CHANGE_COOLDOWN_MS, 'med');
    expect(r.state.belowSinceMs).not.toBeNull();
  });
});
