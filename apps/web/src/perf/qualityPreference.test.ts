import { describe, expect, it } from "vitest";
import {
  hasAutoQualityBeenApplied,
  hasManualQualityOverride,
  markAutoQualityApplied,
  markManualQualityOverride
} from "./qualityPreference";

/** Minimal in-memory Storage stand-in — no jsdom in this project's vitest env. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    }
  } as Storage;
}

describe("qualityPreference", () => {
  it("defaults to no manual override and no auto-applied flag", () => {
    const storage = fakeStorage();
    expect(hasManualQualityOverride(storage)).toBe(false);
    expect(hasAutoQualityBeenApplied(storage)).toBe(false);
  });

  it("persists a manual override", () => {
    const storage = fakeStorage();
    markManualQualityOverride(storage);
    expect(hasManualQualityOverride(storage)).toBe(true);
  });

  it("persists the auto-applied flag independently of the manual flag", () => {
    const storage = fakeStorage();
    markAutoQualityApplied(storage);
    expect(hasAutoQualityBeenApplied(storage)).toBe(true);
    expect(hasManualQualityOverride(storage)).toBe(false);
  });

  it("does not throw when storage access fails", () => {
    const throwing: Storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0
    };
    expect(() => markManualQualityOverride(throwing)).not.toThrow();
    expect(hasManualQualityOverride(throwing)).toBe(false);
  });
});
