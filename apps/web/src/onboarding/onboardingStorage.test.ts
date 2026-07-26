import { describe, expect, it } from "vitest";
import { hasSeenOnboarding, markOnboardingSeen, resetOnboardingSeen } from "./onboardingStorage";

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

describe("onboardingStorage", () => {
  it("defaults to not-seen for a fresh storage", () => {
    expect(hasSeenOnboarding(fakeStorage())).toBe(false);
  });

  it("marks as seen and persists it", () => {
    const storage = fakeStorage();
    markOnboardingSeen(storage);
    expect(hasSeenOnboarding(storage)).toBe(true);
  });

  it("resetOnboardingSeen clears the flag so the tour would show again", () => {
    const storage = fakeStorage();
    markOnboardingSeen(storage);
    resetOnboardingSeen(storage);
    expect(hasSeenOnboarding(storage)).toBe(false);
  });

  it("treats storage errors as not-seen rather than throwing", () => {
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
    expect(() => hasSeenOnboarding(throwing)).not.toThrow();
    expect(hasSeenOnboarding(throwing)).toBe(false);
    expect(() => markOnboardingSeen(throwing)).not.toThrow();
  });
});
