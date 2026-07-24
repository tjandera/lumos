import SunCalc from 'suncalc';
import { DEG2RAD } from './units';

export interface SunVector {
  /** Unit vector pointing toward the sun, world space (+Z north, +X east, +Y up). */
  x: number;
  y: number;
  z: number;
  /** Radians above the horizon (negative at night). */
  altitude: number;
  /** Radians, suncalc convention (measured from south, clockwise toward west). */
  azimuth: number;
}

/**
 * Direction toward the sun in world space for a location, instant, and building
 * orientation. suncalc gives azimuth measured from *south*; we convert to a bearing
 * from north (+Z), apply the building's `trueNorthOffsetDeg`, and lift by altitude.
 * `y` is negative when the sun is below the horizon.
 *
 * NOTE: `date` carries its own instant/timezone — build it in the site's local time
 * so "5pm" means 5pm there, not in the viewer's browser.
 */
export function sunVector(lat: number, lng: number, date: Date, trueNorthOffsetDeg = 0): SunVector {
  const { altitude, azimuth } = SunCalc.getPosition(date, lat, lng);
  const bearingFromNorth = Math.PI + azimuth - trueNorthOffsetDeg * DEG2RAD;
  const cosAlt = Math.cos(altitude);
  return {
    x: cosAlt * Math.sin(bearingFromNorth),
    y: Math.sin(altitude),
    z: cosAlt * Math.cos(bearingFromNorth),
    altitude,
    azimuth,
  };
}

/**
 * Direction toward the sun from explicit compass angles — for manual sun control.
 * `azimuthDeg` is measured from north (+Z) clockwise (90 = east/+X); `elevationDeg` is
 * degrees above the horizon. Returns the same shape as `sunVector`.
 */
export function sunFromAngles(azimuthDeg: number, elevationDeg: number): SunVector {
  const az = azimuthDeg * DEG2RAD;
  const el = elevationDeg * DEG2RAD;
  const cosEl = Math.cos(el);
  return {
    x: cosEl * Math.sin(az),
    y: Math.sin(el),
    z: cosEl * Math.cos(az),
    altitude: el,
    azimuth: az,
  };
}

export interface SunPathPoint extends SunVector {
  /** Minutes since local midnight for this sample. */
  minutes: number;
}

/**
 * Samples the sun across a full day at a location, returning the points where it is
 * at/above the horizon — the visible arc it traces. Used to draw a sun-path in the
 * scene so the daily light study is readable at a glance.
 */
export function sunPath(
  lat: number,
  lng: number,
  date: Date,
  trueNorthOffsetDeg = 0,
  stepMinutes = 15,
): SunPathPoint[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const points: SunPathPoint[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += stepMinutes) {
    const dt = new Date(year, month, day, Math.floor(minutes / 60), minutes % 60);
    const s = sunVector(lat, lng, dt, trueNorthOffsetDeg);
    if (s.y > -0.02) points.push({ ...s, minutes });
  }
  return points;
}

export interface DaylightTimes {
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date;
  /** Hours of daylight (sunset − sunrise); 0 if the sun never rises that day. */
  dayLengthHours: number;
}

/** Sunrise, sunset, solar noon, and day length for a location + date. */
export function daylightTimes(lat: number, lng: number, date: Date): DaylightTimes {
  const t = SunCalc.getTimes(date, lat, lng);
  const valid = (d: Date) => d instanceof Date && !Number.isNaN(d.getTime());
  const sunrise = valid(t.sunrise) ? t.sunrise : null;
  const sunset = valid(t.sunset) ? t.sunset : null;
  const dayLengthHours = sunrise && sunset ? (sunset.getTime() - sunrise.getTime()) / 3_600_000 : 0;
  return { sunrise, sunset, solarNoon: t.solarNoon, dayLengthHours };
}
