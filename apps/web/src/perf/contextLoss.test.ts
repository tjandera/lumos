import { afterEach, describe, expect, it, vi } from "vitest";
import { attachContextLossHandlers, simulateContextLoss } from "./contextLoss";

describe("attachContextLossHandlers", () => {
  it("calls preventDefault and onLost when webglcontextlost fires", () => {
    const target = new EventTarget();
    const onLost = vi.fn();
    const onRestored = vi.fn();
    attachContextLossHandlers(target, { onLost, onRestored });

    const event = new Event("webglcontextlost", { cancelable: true });
    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(onRestored).not.toHaveBeenCalled();
  });

  it("calls onRestored when webglcontextrestored fires", () => {
    const target = new EventTarget();
    const onLost = vi.fn();
    const onRestored = vi.fn();
    attachContextLossHandlers(target, { onLost, onRestored });

    target.dispatchEvent(new Event("webglcontextrestored"));

    expect(onRestored).toHaveBeenCalledTimes(1);
    expect(onLost).not.toHaveBeenCalled();
  });

  it("returned cleanup removes both listeners", () => {
    const target = new EventTarget();
    const onLost = vi.fn();
    const onRestored = vi.fn();
    const cleanup = attachContextLossHandlers(target, { onLost, onRestored });
    cleanup();

    target.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    target.dispatchEvent(new Event("webglcontextrestored"));

    expect(onLost).not.toHaveBeenCalled();
    expect(onRestored).not.toHaveBeenCalled();
  });
});

describe("simulateContextLoss", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls loseContext immediately and restoreContext after the delay", () => {
    vi.useFakeTimers();
    const loseContext = vi.fn();
    const restoreContext = vi.fn();
    const gl = { getExtension: () => ({ loseContext, restoreContext }) };

    simulateContextLoss(gl, 500);
    expect(loseContext).toHaveBeenCalledTimes(1);
    expect(restoreContext).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(restoreContext).toHaveBeenCalledTimes(1);
  });

  it("is a no-op (with a warning) when the extension is unavailable", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const gl = { getExtension: () => null };
    expect(() => simulateContextLoss(gl)).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
