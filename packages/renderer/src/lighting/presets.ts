/**
 * Quality presets for the lighting rig. Higher tiers trade frame budget for
 * shadow resolution and an ambient-occlusion pass.
 */

export type QualityLevel = "low" | "medium" | "high";

export interface QualitySettings {
  /** Whether the sun casts shadows at all. */
  sunShadows: boolean;
  /** Shadow-map resolution (px) for the sun. */
  shadowMapSize: number;
  /** Whether lamps (point lights) cast shadows. */
  lampShadows: boolean;
  /** Whether to run the N8AO ambient-occlusion postprocessing pass. */
  ambientOcclusion: boolean;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  low: {
    sunShadows: false,
    shadowMapSize: 0,
    lampShadows: false,
    ambientOcclusion: false
  },
  medium: {
    sunShadows: true,
    shadowMapSize: 1024,
    lampShadows: false,
    ambientOcclusion: false
  },
  high: {
    sunShadows: true,
    shadowMapSize: 2048,
    lampShadows: true,
    ambientOcclusion: true
  }
};

export function qualitySettings(level: QualityLevel): QualitySettings {
  return QUALITY_PRESETS[level];
}
