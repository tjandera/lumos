import { describe, expect, it } from "vitest";
import {
  AUTO_DOWNGRADE_FPS_THRESHOLD,
  AUTO_DOWNGRADE_SUSTAIN_MS,
  evaluateAutoDowngrade,
  initialAutoDowngradeState,
  type AutoDowngradeState
} from "./autoQuality";

const T0 = 1_000_000;

describe("evaluateAutoDowngrade", () => {
  it("does nothing while fps stays at/above the threshold", () => {
    const r1 = evaluateAutoDowngrade(initialAutoDowngradeState, 60, T0, "high");
    expect(r1.downgradeTo).toBeNull();
    const r2 = evaluateAutoDowngrade(r1.state, AUTO_DOWNGRADE_FPS_THRESHOLD, T0 + 1000, "high");
    expect(r2.downgradeTo).toBeNull();
  });

  it("ignores fps===0 samples (no data yet) without starting the timer", () => {
    const r1 = evaluateAutoDowngrade(initialAutoDowngradeState, 0, T0, "high");
    expect(r1.state.belowThresholdSinceMs).toBeNull();
    expect(r1.downgradeTo).toBeNull();
  });

  it("does not downgrade if the drop is not sustained for the full window", () => {
    let state: AutoDowngradeState = initialAutoDowngradeState;
    let result = evaluateAutoDowngrade(state, 20, T0, "high");
    state = result.state;
    expect(result.downgradeTo).toBeNull();

    result = evaluateAutoDowngrade(state, 20, T0 + AUTO_DOWNGRADE_SUSTAIN_MS - 1, "high");
    state = result.state;
    expect(result.downgradeTo).toBeNull();
  });

  it("downgrades exactly one tier once the drop has been sustained for the full window", () => {
    let state: AutoDowngradeState = initialAutoDowngradeState;
    let result = evaluateAutoDowngrade(state, 20, T0, "high");
    state = result.state;

    result = evaluateAutoDowngrade(state, 20, T0 + AUTO_DOWNGRADE_SUSTAIN_MS, "high");
    expect(result.downgradeTo).toBe("medium");
    expect(result.state.downgraded).toBe(true);
  });

  it("never fires a second downgrade even if fps stays low afterward", () => {
    let state: AutoDowngradeState = { belowThresholdSinceMs: T0, downgraded: true };
    const result = evaluateAutoDowngrade(state, 10, T0 + AUTO_DOWNGRADE_SUSTAIN_MS * 3, "medium");
    expect(result.downgradeTo).toBeNull();
    state = result.state;
    expect(state.downgraded).toBe(true);
  });

  it("resets the timer if fps recovers before the window elapses", () => {
    let state: AutoDowngradeState = initialAutoDowngradeState;
    let result = evaluateAutoDowngrade(state, 20, T0, "high");
    state = result.state;
    expect(state.belowThresholdSinceMs).toBe(T0);

    result = evaluateAutoDowngrade(state, 55, T0 + 2000, "high");
    state = result.state;
    expect(state.belowThresholdSinceMs).toBeNull();

    // Dropping again afterward restarts the 10s window from the new time.
    result = evaluateAutoDowngrade(state, 20, T0 + 2000 + AUTO_DOWNGRADE_SUSTAIN_MS - 1, "high");
    expect(result.downgradeTo).toBeNull();
  });

  it("is a no-op at the lowest tier (nothing left to downgrade to)", () => {
    const state: AutoDowngradeState = initialAutoDowngradeState;
    const result = evaluateAutoDowngrade(state, 10, T0 + AUTO_DOWNGRADE_SUSTAIN_MS, "low");
    expect(result.downgradeTo).toBeNull();
    expect(result.state.downgraded).toBe(false);
  });
});
