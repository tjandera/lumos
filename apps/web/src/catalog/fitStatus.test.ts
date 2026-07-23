import { describe, it, expect } from "vitest";
import { classifyFit } from "./fitStatus";

describe("classifyFit", () => {
  it("classifies fits correctly based on clearance", () => {
    expect(classifyFit({ width: 4, depth: 3 }, { w: 2, d: 0.9, h: 0.8 }).level).toBe("fits");
  });

  it("classifies tight fit when it fits but misses clearance", () => {
    expect(classifyFit({ width: 4, depth: 3 }, { w: 3.6, d: 2.6, h: 0.8 }).level).toBe("tight");
  });

  it("classifies does-not-fit when it exceeds bounds", () => {
    expect(classifyFit({ width: 4, depth: 3 }, { w: 4.1, d: 1, h: 0.8 }).level).toBe("does-not-fit");
  });

  it("checks alternate orientation", () => {
    // room: 3x4, item: 2x0.9 (fits if rotated)
    expect(classifyFit({ width: 3, depth: 4 }, { w: 2, d: 0.9, h: 0.8 }).level).toBe("fits");
    
    // room: 3x4, item: 3.6x2.6 (tight if rotated)
    expect(classifyFit({ width: 3, depth: 4 }, { w: 3.6, d: 2.6, h: 0.8 }).level).toBe("tight");
  });
});
