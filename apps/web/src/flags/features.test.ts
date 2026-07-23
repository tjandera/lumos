import { describe, expect, it, afterEach } from "vitest";
import { clearFeatureOverrides, isEnabled, setFeatureOverride } from "./features";

describe("features flags", () => {
  afterEach(() => {
    clearFeatureOverrides();
  });

  it("defaults 'ai' to false when no env/override is set", () => {
    expect(isEnabled("ai")).toBe(false);
  });

  it("override takes precedence over the env-derived value", () => {
    setFeatureOverride("ai", true);
    expect(isEnabled("ai")).toBe(true);
  });

  it("clearing a single override falls back to env value", () => {
    setFeatureOverride("ai", true);
    setFeatureOverride("ai", undefined);
    expect(isEnabled("ai")).toBe(false);
  });

  it("clearFeatureOverrides resets all overrides", () => {
    setFeatureOverride("ai", true);
    clearFeatureOverrides();
    expect(isEnabled("ai")).toBe(false);
  });
});
