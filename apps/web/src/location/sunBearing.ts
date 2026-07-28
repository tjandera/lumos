/**
 * Compass bearings for the sun, used to draw sunrise/sunset arrows on the location map.
 *
 * These are *true* bearings — deliberately computed with a zero north offset, because
 * the map is drawn in real-world north-up space. The building's `trueNorthOffsetDeg`
 * rotates the room footprint drawn on top of the map, not the sun arrows themselves.
 */

import { daylightTimes, sunVector } from '@interior/core';

const RAD2DEG = 180 / Math.PI;

/**
 * Compass bearing (degrees clockwise from north) of a world-space sun vector.
 * World convention is +Z north, +X east (see units.ts), so `atan2(x, z)` is the
 * bearing from north; the result is normalised to [0, 360).
 */
export function bearingFromSunVector(x: number, z: number): number {
  if (x === 0 && z === 0) return 0;
  return ((Math.atan2(x, z) * RAD2DEG) % 360 + 360) % 360;
}

const POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const;

/** 16-point compass label for a bearing, e.g. 67.5 -> "ENE". */
export function compassLabel(bearingDeg: number): string {
  const norm = ((bearingDeg % 360) + 360) % 360;
  // 16 sectors of 22.5 degrees, each centred on its point (N spans 348.75-11.25).
  return POINTS[Math.round(norm / 22.5) % 16]!;
}

export interface SunBearings {
  sunriseDeg: number;
  sunsetDeg: number;
  sunrise: Date;
  sunset: Date;
}

/**
 * Bearings the sun rises and sets at, for a location and date. Returns null where the
 * sun never crosses the horizon that day — polar summer/winter, where suncalc yields
 * no sunrise/sunset and an arrow would be meaningless rather than merely wrong.
 */
export function sunriseSunsetBearings(lat: number, lng: number, date: Date): SunBearings | null {
  const times = daylightTimes(lat, lng, date);
  const { sunrise, sunset } = times;
  if (!sunrise || !sunset) return null;
  if (Number.isNaN(sunrise.getTime()) || Number.isNaN(sunset.getTime())) return null;

  const rise = sunVector(lat, lng, sunrise, 0);
  const set = sunVector(lat, lng, sunset, 0);
  return {
    sunrise,
    sunset,
    sunriseDeg: bearingFromSunVector(rise.x, rise.z),
    sunsetDeg: bearingFromSunVector(set.x, set.z),
  };
}

/**
 * Ground resolution in metres per screen pixel for a Web Mercator tile map. Needed to
 * draw the room footprint at its true size on the map: a 5 m wall must cover the same
 * distance as 5 m of the aerial image under it, at every zoom level and latitude.
 */
export function metersPerPixel(lat: number, zoom: number): number {
  const EQUATOR_M = 40075016.686;
  return (EQUATOR_M * Math.cos((lat * Math.PI) / 180)) / 2 ** (zoom + 8);
}
