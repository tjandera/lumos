export interface LampSample {
  x: number;
  y: number;
  z: number;
  intensityCandela: number;
}

export interface IlluminanceInputs {
  /** sin(sun altitude) = sun.y in world space (≤0 at night). */
  sunAltitudeSin: number;
  /** Does the point receive the direct beam (unblocked by walls)? */
  sunLit: boolean;
  lamps: LampSample[];
  /** Ambient / diffuse sky illuminance reaching the point (lux). Default 0. */
  skyLux?: number;
}

const SUN_DIRECT_MAX = 90000; // lux, horizontal, high clear sun

/**
 * Horizontal illuminance (lux) on the floor at a point, from direct sun (if lit),
 * ambient sky, and point lamps. The lamp term is physically-based inverse-square —
 * for a horizontal surface, E = I·cosθ/d² = I·(lampHeight)/d³ (candela → lux). The
 * daylight terms are engineering estimates, not photometric ground truth.
 */
export function illuminanceAt(point: { x: number; z: number }, inputs: IlluminanceInputs): number {
  let lux = inputs.skyLux ?? 0;
  if (inputs.sunLit && inputs.sunAltitudeSin > 0) {
    lux += SUN_DIRECT_MAX * inputs.sunAltitudeSin;
  }
  for (const l of inputs.lamps) {
    const dy = l.y; // floor is at y = 0
    if (dy <= 0) continue;
    const dx = l.x - point.x;
    const dz = l.z - point.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < 1e-4) continue;
    lux += (l.intensityCandela * dy) / (d2 * Math.sqrt(d2));
  }
  return lux;
}

export interface FixtureState {
  intensityCandela: number;
  on: boolean;
  auto: boolean;
}

/**
 * A fixture's effective brightness right now: 0 if switched off; otherwise its set
 * intensity, scaled by `(1 - dayFactor)` when `auto` is on so it ramps up as daylight
 * fades (dayFactor 1 = full daylight, 0 = night) and stays constant otherwise.
 */
export function effectiveFixtureIntensity(fixture: FixtureState, dayFactor: number): number {
  if (!fixture.on) return 0;
  if (!fixture.auto) return fixture.intensityCandela;
  return fixture.intensityCandela * (1 - clamp01(dayFactor));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export interface RoomStandard {
  id: string;
  name: string;
  /** Recommended maintained illuminance (lux). */
  targetLux: number;
}

/** Rough recommended illuminance levels by room use (indicative, not code). */
export const ROOM_STANDARDS: RoomStandard[] = [
  { id: 'bedroom', name: 'Bedroom', targetLux: 100 },
  { id: 'living', name: 'Living room', targetLux: 150 },
  { id: 'kitchen', name: 'Kitchen', targetLux: 300 },
  { id: 'desk', name: 'Desk / study', targetLux: 500 },
];
