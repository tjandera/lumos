/**
 * Pure localStorage-gated "have they seen the onboarding tour" logic.
 * Kept separate from the `Onboarding` component so the gating decision is
 * unit-testable without React/DOM. `storage` is injectable for tests; a
 * real browser app is allowed to gate on localStorage per the phase 5b brief
 * (this isn't an artifact/sandboxed context).
 */

const SEEN_KEY = "interior:onboarding:seen:v1";

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
    // Private-mode/disabled storage: fail silently, tour just reappears next load.
  }
}

/** True once the user has dismissed (or completed) the tour at least once. */
export function hasSeenOnboarding(storage: Storage = localStorage): boolean {
  return safeGet(storage, SEEN_KEY) === "1";
}

export function markOnboardingSeen(storage: Storage = localStorage): void {
  safeSet(storage, SEEN_KEY, "1");
}

/** Test/dev helper: force the tour to show again on next load. */
export function resetOnboardingSeen(storage: Storage = localStorage): void {
  try {
    storage.removeItem(SEEN_KEY);
  } catch {
    // ignore
  }
}
