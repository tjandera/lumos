import { describe, expect, it } from 'vitest';
import { bearingFromSunVector, compassLabel, metersPerPixel, sunriseSunsetBearings } from './sunBearing';

describe('bearingFromSunVector', () => {
  it('maps the world axes to compass bearings (+Z north, +X east)', () => {
    expect(bearingFromSunVector(0, 1)).toBeCloseTo(0); // north
    expect(bearingFromSunVector(1, 0)).toBeCloseTo(90); // east
    expect(bearingFromSunVector(0, -1)).toBeCloseTo(180); // south
    expect(bearingFromSunVector(-1, 0)).toBeCloseTo(270); // west
  });

  it('normalises into [0, 360) rather than returning negatives', () => {
    // Due west via atan2 is -90; callers rotate SVG by this, so a negative would
    // still render but read as garbage in the "sets at 270°" text.
    expect(bearingFromSunVector(-1, 0)).toBe(270);
    expect(bearingFromSunVector(-0.001, 1)).toBeGreaterThan(180);
  });

  it('is defined for a degenerate zero vector', () => {
    expect(bearingFromSunVector(0, 0)).toBe(0);
  });
});

describe('compassLabel', () => {
  it('labels the cardinal points', () => {
    expect(compassLabel(0)).toBe('N');
    expect(compassLabel(90)).toBe('E');
    expect(compassLabel(180)).toBe('S');
    expect(compassLabel(270)).toBe('W');
  });

  it('labels intercardinal and secondary points', () => {
    expect(compassLabel(45)).toBe('NE');
    expect(compassLabel(67.5)).toBe('ENE');
    expect(compassLabel(292.5)).toBe('WNW');
  });

  it('wraps past 360 back to north instead of falling off the table', () => {
    expect(compassLabel(360)).toBe('N');
    expect(compassLabel(359)).toBe('N');
    expect(compassLabel(-90)).toBe('W');
  });
});

describe('sunriseSunsetBearings', () => {
  it('puts sunrise in the east and sunset in the west at a mid-latitude equinox', () => {
    // London, ~equinox: the sun rises close to due east and sets close to due west.
    const b = sunriseSunsetBearings(51.5074, -0.1278, new Date(2026, 2, 20, 12, 0));
    expect(b).not.toBeNull();
    expect(b!.sunriseDeg).toBeGreaterThan(80);
    expect(b!.sunriseDeg).toBeLessThan(100);
    expect(b!.sunsetDeg).toBeGreaterThan(260);
    expect(b!.sunsetDeg).toBeLessThan(280);
  });

  it('swings sunrise north of east at a northern midsummer', () => {
    const june = sunriseSunsetBearings(51.5074, -0.1278, new Date(2026, 5, 21, 12, 0));
    expect(june).not.toBeNull();
    // Midsummer sunrise is well north of due east at this latitude.
    expect(june!.sunriseDeg).toBeLessThan(70);
  });

  it('returns null in the polar day, where there is no sunrise to point at', () => {
    // Longyearbyen in midsummer — the sun never sets.
    expect(sunriseSunsetBearings(78.22, 15.63, new Date(2026, 5, 21, 12, 0))).toBeNull();
  });
});

describe('metersPerPixel', () => {
  it('gives the standard ~156 m/px at the equator, zoom 0', () => {
    expect(metersPerPixel(0, 0)).toBeCloseTo(156543.03, 1);
  });

  it('halves with each zoom level', () => {
    const z10 = metersPerPixel(0, 10);
    expect(metersPerPixel(0, 11)).toBeCloseTo(z10 / 2, 6);
  });

  it('shrinks toward the poles as Mercator stretches', () => {
    expect(metersPerPixel(60, 15)).toBeLessThan(metersPerPixel(0, 15));
  });

  it('is fine enough at building zoom to draw a room in real metres', () => {
    // At zoom 19 a 5m wall should be tens of pixels — not sub-pixel, not off-screen.
    const px = 5 / metersPerPixel(1.3, 19);
    expect(px).toBeGreaterThan(15);
    expect(px).toBeLessThan(500);
  });
});
