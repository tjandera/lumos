import { describe, it, expect } from 'vitest';
import { illuminanceAt, effectiveFixtureIntensity } from './illuminance.js';

describe('illuminanceAt', () => {
  it('is zero with no light', () => {
    expect(illuminanceAt({ x: 0, z: 0 }, { sunAltitudeSin: 0.5, sunLit: false, lamps: [] })).toBe(0);
  });

  it('adds direct sun when lit, scaling with altitude', () => {
    const high = illuminanceAt({ x: 0, z: 0 }, { sunAltitudeSin: 0.9, sunLit: true, lamps: [] });
    const low = illuminanceAt({ x: 0, z: 0 }, { sunAltitudeSin: 0.3, sunLit: true, lamps: [] });
    expect(high).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(10000);
  });

  it('computes lamp illuminance by inverse-square on the floor', () => {
    const lamps = [{ x: 0, y: 2, z: 0, intensityCandela: 400 }];
    const under = illuminanceAt({ x: 0, z: 0 }, { sunAltitudeSin: 0, sunLit: false, lamps });
    const away = illuminanceAt({ x: 3, z: 0 }, { sunAltitudeSin: 0, sunLit: false, lamps });
    // directly under: I·dy/d³ = 400·2 / 2³ = 100 lux
    expect(under).toBeCloseTo(100, 1);
    expect(away).toBeLessThan(under);
  });
});

describe('effectiveFixtureIntensity', () => {
  it('is zero when switched off, regardless of auto', () => {
    expect(effectiveFixtureIntensity({ intensityCandela: 500, on: false, auto: false }, 0)).toBe(0);
    expect(effectiveFixtureIntensity({ intensityCandela: 500, on: false, auto: true }, 0)).toBe(0);
  });

  it('ignores dayFactor when auto is off', () => {
    expect(effectiveFixtureIntensity({ intensityCandela: 300, on: true, auto: false }, 1)).toBe(300);
  });

  it('ramps down toward zero in daylight and up to full at night when auto', () => {
    const day = effectiveFixtureIntensity({ intensityCandela: 300, on: true, auto: true }, 1);
    const night = effectiveFixtureIntensity({ intensityCandela: 300, on: true, auto: true }, 0);
    expect(day).toBe(0);
    expect(night).toBe(300);
  });
});
