import { describe, expect, it } from "vitest";
import { classifyRendererTier, pickInitialQuality, type DeviceSignals } from "./deviceCapability";

function signals(overrides: Partial<DeviceSignals> = {}): DeviceSignals {
  return {
    devicePixelRatio: 1,
    maxTouchPoints: 0,
    isMobileUA: false,
    rendererString: null,
    hardwareConcurrency: 8,
    ...overrides
  };
}

describe("classifyRendererTier", () => {
  it("classifies known software renderers as low", () => {
    expect(classifyRendererTier("Google SwiftShader")).toBe("low");
    expect(classifyRendererTier("llvmpipe (LLVM 15.0.0, 256 bits)")).toBe("low");
  });

  it("classifies known mobile GPUs as mid", () => {
    expect(classifyRendererTier("Adreno (TM) 640")).toBe("mid");
    expect(classifyRendererTier("Mali-G78")).toBe("mid");
  });

  it("classifies known discrete/desktop GPUs as high", () => {
    expect(classifyRendererTier("NVIDIA GeForce RTX 3080/PCIe/SSE2")).toBe("high");
    expect(classifyRendererTier("AMD Radeon Pro 5500M")).toBe("high");
    expect(classifyRendererTier("Apple M2")).toBe("high");
  });

  it("returns unknown for null or unrecognized strings", () => {
    expect(classifyRendererTier(null)).toBe("unknown");
    expect(classifyRendererTier("Some Mystery GPU 9000")).toBe("unknown");
  });
});

describe("pickInitialQuality", () => {
  it("picks low for software-rendered devices regardless of anything else", () => {
    expect(pickInitialQuality(signals({ rendererString: "SwiftShader", hardwareConcurrency: 32 }))).toBe("low");
  });

  it("picks low for high-DPR mobile devices", () => {
    expect(
      pickInitialQuality(signals({ isMobileUA: true, maxTouchPoints: 5, devicePixelRatio: 3 }))
    ).toBe("low");
  });

  it("picks medium for ordinary mobile devices", () => {
    expect(
      pickInitialQuality(signals({ isMobileUA: true, maxTouchPoints: 5, devicePixelRatio: 2 }))
    ).toBe("medium");
  });

  it("picks low for mobile with a mid-tier GPU even at low DPR", () => {
    expect(
      pickInitialQuality(
        signals({ isMobileUA: true, maxTouchPoints: 5, devicePixelRatio: 2, rendererString: "Adreno 640" })
      )
    ).toBe("low");
  });

  it("picks high for desktop with a recognized high-tier GPU", () => {
    expect(pickInitialQuality(signals({ rendererString: "NVIDIA GeForce RTX 4070" }))).toBe("high");
  });

  it("picks medium for desktop with unknown GPU and low core count", () => {
    expect(pickInitialQuality(signals({ hardwareConcurrency: 2 }))).toBe("medium");
  });

  it("defaults to high for desktop with unknown GPU and healthy core count", () => {
    expect(pickInitialQuality(signals({ hardwareConcurrency: 8 }))).toBe("high");
  });

  it("defaults to high when core count is unavailable and nothing else disqualifies it", () => {
    expect(pickInitialQuality(signals({ hardwareConcurrency: null }))).toBe("high");
  });
});
