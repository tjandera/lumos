import { describe, expect, it, afterEach } from "vitest";
import { clearFeatureOverrides, isEnabled, readBooleanEnv, setFeatureOverride } from "./features";

describe("features flags", () => {
  afterEach(() => {
    clearFeatureOverrides();
  });

  it("defaults 'ai' to true when no env/override is set", () => {
    expect(isEnabled("ai")).toBe(true);
  });

  it("override takes precedence over the env-derived value", () => {
    setFeatureOverride("ai", false);
    expect(isEnabled("ai")).toBe(false);
  });

  it("clearing a single override falls back to the (default-on) env value", () => {
    setFeatureOverride("ai", false);
    setFeatureOverride("ai", undefined);
    expect(isEnabled("ai")).toBe(true);
  });

  it("clearFeatureOverrides resets all overrides", () => {
    setFeatureOverride("ai", false);
    clearFeatureOverrides();
    expect(isEnabled("ai")).toBe(true);
  });
});

describe("readBooleanEnv (VITE_FEATURE_AI default-on parsing)", () => {
  it("falls back to defaultValue when unset", () => {
    expect(readBooleanEnv(undefined, true)).toBe(true);
    expect(readBooleanEnv(undefined, false)).toBe(false);
  });

  it("is disabled only by explicit 'false'/'0'/false, regardless of default", () => {
    expect(readBooleanEnv("false", true)).toBe(false);
    expect(readBooleanEnv("0", true)).toBe(false);
    expect(readBooleanEnv(false, true)).toBe(false);
  });

  it("is enabled by explicit 'true'/'1'/true, regardless of default", () => {
    expect(readBooleanEnv("true", false)).toBe(true);
    expect(readBooleanEnv("1", false)).toBe(true);
    expect(readBooleanEnv(true, false)).toBe(true);
  });

  it("falls back to defaultValue for unrecognized values", () => {
    expect(readBooleanEnv("garbage", true)).toBe(true);
    expect(readBooleanEnv("garbage", false)).toBe(false);
  });
});
