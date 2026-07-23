/**
 * Tiny feature-flag module.
 *
 * Flags are sourced from `import.meta.env` (Vite) at module load, with a
 * test/dev override hook (`setFeatureOverride`) that takes precedence over
 * the env-derived value.
 *
 * `ai` defaults to ON (the assistant drawer shows out of the box); set
 * `VITE_FEATURE_AI=false` at build time to hide it. This only controls the
 * web-side drawer — whether `POST /ai/chat` actually works still depends on
 * the API's own `FEATURE_AI` (also on by default, see `apps/api/src/ai/provider.ts`).
 */

export type FeatureName = "ai";

interface FeatureFlags {
  ai: boolean;
}

/** Defaults to `defaultValue`; only explicit `"false"`/`"0"`/`false` turns it off. Exported for unit tests. */
export function readBooleanEnv(value: string | boolean | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  if (typeof value === "boolean") return value;
  if (value === "false" || value === "0") return false;
  if (value === "true" || value === "1") return true;
  return defaultValue;
}

function readEnvFlags(): FeatureFlags {
  // Vite replaces `import.meta.env.*` at build time; guard for non-Vite
  // (e.g. plain Node/Vitest) environments where `import.meta.env` may be
  // undefined.
  const env = (import.meta as { env?: Record<string, string | boolean | undefined> }).env ?? {};
  return {
    ai: readBooleanEnv(env.VITE_FEATURE_AI, true)
  };
}

const envFlags = readEnvFlags();

/** Test/dev override — takes precedence over env flags when set. Call with
 *  `undefined` to clear the override and fall back to env-derived flags. */
let overrides: Partial<FeatureFlags> = {};

export function setFeatureOverride(name: FeatureName, value: boolean | undefined): void {
  if (value === undefined) {
    delete overrides[name];
  } else {
    overrides = { ...overrides, [name]: value };
  }
}

export function clearFeatureOverrides(): void {
  overrides = {};
}

/** Typed accessor for a feature flag. Override (if set) wins over env. */
export function isEnabled(name: FeatureName): boolean {
  const override = overrides[name];
  if (override !== undefined) return override;
  return envFlags[name];
}
