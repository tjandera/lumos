import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSimulateContextLossFn,
  isContextLost,
  resetContextLossStore,
  setContextLost,
  setSimulateContextLossFn,
  subscribeContextLoss
} from "./contextLossStore";

describe("contextLossStore", () => {
  afterEach(() => {
    resetContextLossStore();
  });

  it("starts not-lost with no simulate fn", () => {
    expect(isContextLost()).toBe(false);
    expect(getSimulateContextLossFn()).toBeNull();
  });

  it("setContextLost updates state and notifies subscribers only on change", () => {
    const listener = vi.fn();
    subscribeContextLoss(listener);

    setContextLost(true);
    expect(isContextLost()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    setContextLost(true); // no-op, same value
    expect(listener).toHaveBeenCalledTimes(1);

    setContextLost(false);
    expect(isContextLost()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("subscribeContextLoss returns an unsubscribe function", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeContextLoss(listener);
    unsubscribe();
    setContextLost(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it("stores and retrieves the simulate function", () => {
    const fn = vi.fn();
    setSimulateContextLossFn(fn);
    expect(getSimulateContextLossFn()).toBe(fn);
    setSimulateContextLossFn(null);
    expect(getSimulateContextLossFn()).toBeNull();
  });
});
