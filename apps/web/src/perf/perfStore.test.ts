import { describe, expect, it, vi } from "vitest";
import { getPerfCounters, resetPerfCounters, setPerfCounters, subscribePerfCounters } from "./perfStore";

describe("perfStore", () => {
  it("starts with zeroed counters", () => {
    resetPerfCounters();
    expect(getPerfCounters()).toEqual({
      fps: 0,
      worstFrameFps: 0,
      drawCalls: 0,
      triangles: 0,
      geometries: 0,
      textures: 0
    });
  });

  it("setPerfCounters updates the snapshot", () => {
    const next = { fps: 60, worstFrameFps: 55, drawCalls: 10, triangles: 1000, geometries: 5, textures: 3 };
    setPerfCounters(next);
    expect(getPerfCounters()).toEqual(next);
    resetPerfCounters();
  });

  it("notifies subscribers on update, and unsubscribe stops notifications", () => {
    const listener = vi.fn();
    const unsubscribe = subscribePerfCounters(listener);

    setPerfCounters({ fps: 30, worstFrameFps: 20, drawCalls: 1, triangles: 1, geometries: 1, textures: 1 });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setPerfCounters({ fps: 40, worstFrameFps: 20, drawCalls: 1, triangles: 1, geometries: 1, textures: 1 });
    expect(listener).toHaveBeenCalledTimes(1);

    resetPerfCounters();
  });
});
