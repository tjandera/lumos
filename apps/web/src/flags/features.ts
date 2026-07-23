/**
 * Tiny feature-flag module.
 *
 * Flags are sourced from `import.meta.env` (Vite) at module load, with a
 * test/dev override hook (`setFeatureOverride`) that takes precedence over
 * the env-derived value. No UI is wired to this yet — see retrofit backlog.
 */

export type FeatureName = "ai";

interface FeatureFlags {
  ai: boolean;
}

function readBooleanEnv(value: string | boolean | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  if (typeof value === "boolean") return value;
  return value === "true" || value === "1";
}

function readEnvFlags(): FeatureFlags {
  // Vite replaces `import.meta.env.*` at build time; guard for non-Vite
  // (e.g. plain Node/Vitest) environments where `import.meta.env` may be
  // undefined.
  const env = (import.meta as { env?: Record<string, string | boolean | undefined> }).env ?? {};
  return {
    ai: readBooleanEnv(env.VITE_FEATURE_AI, false)
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
