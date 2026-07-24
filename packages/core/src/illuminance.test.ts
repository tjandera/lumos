import { describe, it, expect } from 'vitest';
import { illuminanceAt } from './illuminance';

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
