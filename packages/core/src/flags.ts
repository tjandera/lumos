/**
 * Feature flags. Core stays framework-agnostic: the host (web app, api) calls
 * `configureFeatures` once at startup with values resolved from its own env, and
 * everything else asks `isFeatureEnabled`. Defaults are all-off so a missing flag
 * never silently ships an unfinished feature.
 */
export type FeatureName = 'ai' | 'roomPhoto';

const defaults: Record<FeatureName, boolean> = {
  ai: false,
  roomPhoto: false,
};

let overrides: Partial<Record<FeatureName, boolean>> = {};

export function configureFeatures(flags: Partial<Record<FeatureName, boolean>>): void {
  overrides = { ...flags };
}

export function isFeatureEnabled(name: FeatureName): boolean {
  return overrides[name] ?? defaults[name];
}
