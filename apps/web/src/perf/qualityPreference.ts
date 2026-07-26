/**
 * Tracks whether the user has ever manually picked a lighting-quality
 * preset (so auto-detect never clobbers a real choice) and whether
 * auto-detect has already run this session (so switching tabs back and
 * forth doesn't re-run it after a dynamic downgrade). Deliberately doesn't
 * touch `sceneStore` — callers wire this up alongside `setLightingQuality`.
 */

const MANUAL_KEY = "interior:quality:manual";
const AUTO_APPLIED_KEY = "interior:quality:autoApplied";

function safeGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // ignore (private-mode storage caps, disabled storage, etc.)
  }
}

/** Persisted across sessions: has the user ever changed quality manually? */
export function hasManualQualityOverride(storage: Storage = localStorage): boolean {
  return safeGet(storage, MANUAL_KEY) === "1";
}

export function markManualQualityOverride(storage: Storage = localStorage): void {
  safeSet(storage, MANUAL_KEY, "1");
}

/** Session-scoped: has auto-detect already applied an initial pick this tab session? */
export function hasAutoQualityBeenApplied(storage: Storage = sessionStorage): boolean {
  return safeGet(storage, AUTO_APPLIED_KEY) === "1";
}

export function markAutoQualityApplied(storage: Storage = sessionStorage): void {
  safeSet(storage, AUTO_APPLIED_KEY, "1");
}
