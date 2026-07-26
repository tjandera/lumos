import { describe, it, expect } from "vitest";
import { formatDimsFull, formatDimsPlain, metersToCm } from "./format";

describe("formatDimsPlain", () => {
  it("formats width and depth only, in plain language", () => {
    expect(formatDimsPlain({ w: 2.1, d: 0.9, h: 0.75 })).toBe("W 2.10 × D 0.90 m");
  });
});

describe("formatDimsFull", () => {
  it("formats width, depth, and height", () => {
    expect(formatDimsFull({ w: 2.1, d: 0.9, h: 0.75 })).toBe("2.10 × 0.90 × 0.75 m");
  });
});

describe("metersToCm", () => {
  it("converts meters to whole centimeters", () => {
    expect(metersToCm(0.15)).toBe(15);
    expect(metersToCm(0.149)).toBe(15);
    expect(metersToCm(2.7)).toBe(270);
  });
});
