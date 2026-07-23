import { describe, expect, it } from "vitest";
import { FrameSampler } from "./frameSampler";

describe("FrameSampler", () => {
  it("returns zero fps before any samples", () => {
    const s = new FrameSampler();
    expect(s.sample()).toEqual({ fps: 0, worstFrameFps: 0 });
  });

  it("computes ~fps from a steady stream of deltas", () => {
    const s = new FrameSampler(10);
    for (let i = 0; i < 10; i++) s.push(1 / 60);
    const { fps, worstFrameFps } = s.sample();
    expect(fps).toBeCloseTo(60, 0);
    expect(worstFrameFps).toBeCloseTo(60, 0);
  });

  it("worst-frame fps reflects the slowest frame in the window", () => {
    const s = new FrameSampler(4);
    s.push(1 / 60);
    s.push(1 / 60);
    s.push(1 / 10); // a hitch
    s.push(1 / 60);
    const { worstFrameFps, fps } = s.sample();
    expect(worstFrameFps).toBeCloseTo(10, 0);
    expect(fps).toBeGreaterThan(worstFrameFps);
  });

  it("drops samples outside the rolling window", () => {
    const s = new FrameSampler(2);
    s.push(1 / 10); // should be evicted
    s.push(1 / 60);
    s.push(1 / 60);
    const { fps } = s.sample();
    expect(fps).toBeCloseTo(60, 0);
  });

  it("ignores non-positive or NaN deltas", () => {
    const s = new FrameSampler(5);
    s.push(1 / 60);
    s.push(0);
    s.push(-1);
    s.push(NaN);
    const { fps } = s.sample();
    expect(fps).toBeCloseTo(60, 0);
  });

  it("reset clears the window", () => {
    const s = new FrameSampler(5);
    s.push(1 / 60);
    s.reset();
    expect(s.sample().fps).toBe(0);
  });
});
