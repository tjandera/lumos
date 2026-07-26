import { describe, it, expect } from 'vitest';
import { sunVector, sunFromAngles, sunPath, daylightTimes } from './sunlight.js';

// New York City.
const NY = { lat: 40.7128, lng: -74.006 };
const SUMMER_NOON = new Date('2026-06-21T17:00:00Z'); // ~13:00 EDT, near solar noon
const SUMMER_MIDNIGHT = new Date('2026-06-21T05:00:00Z'); // ~01:00 EDT

describe('sunVector', () => {
  it('returns a unit vector', () => {
    const s = sunVector(NY.lat, NY.lng, SUMMER_NOON);
    expect(Math.hypot(s.x, s.y, s.z)).toBeCloseTo(1, 6);
  });

  it('is high and to the south at summer solar noon (northern hemisphere)', () => {
    const s = sunVector(NY.lat, NY.lng, SUMMER_NOON);
    expect(s.y).toBeGreaterThan(0.9); // well above the horizon
    expect(s.z).toBeLessThan(0); // +Z is north, so the sun sits to the south (−Z)
    expect(Math.abs(s.x)).toBeLessThan(0.5); // roughly due south
  });

  it('is below the horizon at local midnight', () => {
    expect(sunVector(NY.lat, NY.lng, SUMMER_MIDNIGHT).y).toBeLessThan(0);
  });

  it('rotates horizontally with the building north offset, preserving altitude', () => {
    const base = sunVector(NY.lat, NY.lng, SUMMER_NOON, 0);
    const rot = sunVector(NY.lat, NY.lng, SUMMER_NOON, 90);
    expect(rot.y).toBeCloseTo(base.y, 6); // altitude unchanged by a horizontal spin
    expect(rot.x).not.toBeCloseTo(base.x, 2); // heading changed
  });
});

describe('sunFromAngles', () => {
  it('points straight up at 90° elevation', () => {
    const s = sunFromAngles(0, 90);
    expect(s.y).toBeCloseTo(1, 6);
    expect(Math.hypot(s.x, s.z)).toBeCloseTo(0, 6);
  });

  it('points north (+Z) at azimuth 0 and east (+X) at azimuth 90', () => {
    expect(sunFromAngles(0, 0).z).toBeCloseTo(1, 6);
    expect(sunFromAngles(90, 0).x).toBeCloseTo(1, 6);
  });

  it('returns a unit vector', () => {
    const s = sunFromAngles(210, 35);
    expect(Math.hypot(s.x, s.y, s.z)).toBeCloseTo(1, 6);
  });
});

describe('sunPath', () => {
  it('traces an above-horizon arc that peaks high at summer noon in NY', () => {
    const pts = sunPath(NY.lat, NY.lng, new Date('2026-06-21T12:00:00'), 0, 30);
    expect(pts.length).toBeGreaterThan(10);
    expect(pts.every((p) => p.y > -0.05)).toBe(true);
    expect(Math.max(...pts.map((p) => p.y))).toBeGreaterThan(0.9);
  });
});

describe('daylightTimes', () => {
  it('gives a long summer day in NY, sunrise before sunset', () => {
    const t = daylightTimes(NY.lat, NY.lng, new Date('2026-06-21T12:00:00'));
    expect(t.sunrise).toBeTruthy();
    expect(t.sunset).toBeTruthy();
    expect(t.dayLengthHours).toBeGreaterThan(13); // ~15h at the solstice
    if (t.sunrise && t.sunset) expect(t.sunrise.getTime()).toBeLessThan(t.sunset.getTime());
  });
});
