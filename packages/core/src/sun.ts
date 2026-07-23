/**
 * Pure sun-position math for the lighting rig. Wraps `suncalc` (a small,
 * dependency-free astronomy library) and converts its geographic
 * azimuth/altitude into a world-space direction vector honoring the plan's
 * orientation relative to true north (`northOffset`).
 *
 * No three.js here — this module stays renderer-agnostic and unit-testable in
 * plain Node. The renderer imports `sunDirection` and turns the vector into a
 * `THREE.DirectionalLight`.
 *
 * World & compass conventions (matching the renderer's plan->world mapping,
 * where plan-X -> world-X, plan-Y -> world-Z, world-Y up):
 *   - North = world -Z, East = world +X, South = world +Z, West = world -X.
 *   - Azimuth is measured in radians CLOCKWISE from North through East, as seen
 *     looking down the -Y axis (standard compass bearing).
 *   - `northOffset` is the compass bearing (radians) that the plan's "up"
 *     (world -Z) is rotated by relative to true north; it is added to the
 *     astronomical azimuth so rotating the plan rotates where the sun appears.
 *
 * Time convention: the entered `time` is interpreted as MEAN LOCAL SOLAR time
 * at `longitude` (no timezone database needed). This makes "noon" put the sun
 * near the meridian at any longitude — the intuitive behavior for a
 * time-of-day slider — and keeps results deterministic for tests.
 */

// suncalc is a CommonJS module. Under NodeNext ESM its named exports are not
// reliably statically detected, so bind through the interop default when present.
import * as SunCalcModule from "suncalc";
const SunCalc: typeof SunCalcModule =
  (SunCalcModule as unknown as { default?: typeof SunCalcModule }).default ?? SunCalcModule;
import type { SunLightConfig, Vector3 } from "./types.js";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MINUTES_PER_DAY = 1440;

export interface SunDirectionResult {
  /** Sun altitude above the horizon, radians. Negative means below the horizon (night). */
  elevation: number;
  /**
   * World-space azimuth of the sun, radians, measured clockwise from North
   * (world -Z) through East (world +X). Includes `northOffset`.
   */
  azimuth: number;
  /**
   * Unit vector pointing FROM the scene TOWARD the sun in world space
   * (x East, y up, z South). Place a directional light at `toSun * distance`
   * and target the origin.
   */
  toSun: Vector3;
  /** Unit vector the sunlight travels along (`-toSun`): the light's forward direction. */
  incoming: Vector3;
}

/** Parse a "HH:MM" (or "HH:MM:SS") string into minutes since midnight. */
export function timeToMinutes(time: string): number {
  const parts = time.split(":");
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

/** Format minutes-since-midnight as a zero-padded "HH:MM" string. */
export function minutesToTime(minutes: number): string {
  const clamped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Parse a "YYYY-MM-DD" date string into UTC-midnight epoch ms for that day. */
function utcMidnight(date: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  return Date.UTC(y ?? 1970, (mo ?? 1) - 1, d ?? 1);
}

/** Mean-local-solar offset from UTC for a longitude, in ms (east is positive). */
function solarOffsetMs(longitude: number): number {
  return (longitude / 15) * MS_PER_HOUR;
}

/**
 * Convert a local-solar minute-of-day (at `longitude`) on `date` into the
 * absolute UTC instant suncalc needs.
 */
export function localSolarInstant(date: string, minutes: number, longitude: number): Date {
  return new Date(utcMidnight(date) + minutes * MS_PER_MINUTE - solarOffsetMs(longitude));
}

/** Inverse of `localSolarInstant`: absolute instant -> local-solar minute-of-day. */
export function instantToLocalSolarMinutes(instant: Date, date: string, longitude: number): number {
  return (instant.getTime() - utcMidnight(date) + solarOffsetMs(longitude)) / MS_PER_MINUTE;
}

/**
 * Sun direction for a scene's `SunLightConfig`. Returns elevation, world
 * azimuth (with `northOffset` applied), and unit direction vectors.
 */
export function sunDirection(config: SunLightConfig): SunDirectionResult {
  const instant = localSolarInstant(config.date, timeToMinutes(config.time), config.longitude);
  const pos = SunCalc.getPosition(instant, config.latitude, config.longitude);

  // suncalc azimuth is measured from South, increasing toward West. Convert to
  // a compass bearing from North, then apply the plan's north offset.
  const azimuth = pos.azimuth + Math.PI + config.northOffset;
  const elevation = pos.altitude;

  const cosE = Math.cos(elevation);
  const toSun: Vector3 = {
    x: Math.sin(azimuth) * cosE,
    y: Math.sin(elevation),
    z: -Math.cos(azimuth) * cosE
  };
  const incoming: Vector3 = { x: -toSun.x, y: -toSun.y, z: -toSun.z };

  return { elevation, azimuth, toSun, incoming };
}

export interface SunTimes {
  /** Sunrise in local-solar minutes-of-day, or null if the sun never rises that day. */
  sunriseMinutes: number | null;
  /** Sunset in local-solar minutes-of-day, or null if the sun never sets that day. */
  sunsetMinutes: number | null;
  /** Solar noon in local-solar minutes-of-day (always defined). */
  solarNoonMinutes: number;
}

/**
 * Sunrise / sunset / solar-noon for a location and date, expressed in
 * local-solar minutes-of-day for driving the time-of-day slider range.
 * Polar day/night (no sunrise or sunset) yields `null` for the missing event.
 */
export function sunTimes(date: string, latitude: number, longitude: number): SunTimes {
  const noonInstant = localSolarInstant(date, 12 * 60, longitude);
  const times = SunCalc.getTimes(noonInstant, latitude, longitude);
  const toMin = (d: Date): number | null =>
    Number.isNaN(d.getTime()) ? null : instantToLocalSolarMinutes(d, date, longitude);

  return {
    sunriseMinutes: toMin(times.sunrise),
    sunsetMinutes: toMin(times.sunset),
    solarNoonMinutes: instantToLocalSolarMinutes(times.solarNoon, date, longitude)
  };
}

/**
 * The recommended [min, max] minute range for the time-of-day slider: from
 * ~`padHours` before sunrise to ~`padHours` after sunset, clamped to a full
 * day. Falls back to the whole day when there is no sunrise/sunset (polar).
 */
export function sliderRange(
  date: string,
  latitude: number,
  longitude: number,
  padHours = 1
): { min: number; max: number } {
  const { sunriseMinutes, sunsetMinutes } = sunTimes(date, latitude, longitude);
  if (sunriseMinutes == null || sunsetMinutes == null) {
    return { min: 0, max: MINUTES_PER_DAY };
  }
  const pad = padHours * 60;
  return {
    min: Math.max(0, Math.floor(sunriseMinutes - pad)),
    max: Math.min(MINUTES_PER_DAY, Math.ceil(sunsetMinutes + pad))
  };
}
