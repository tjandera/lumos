import { describe, it, expect } from 'vitest';
import { kelvinToRgb } from './color';

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

describe('kelvinToRgb', () => {
  it('is warm (orange-white) at 2700K — a typical incandescent/lamp temperature', () => {
    const [r, g, b] = rgb(kelvinToRgb(2700));
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it('is roughly neutral white near 6500K (daylight)', () => {
    const [r, , b] = rgb(kelvinToRgb(6500));
    expect(Math.abs(r - b)).toBeLessThan(20);
  });

  it('gets bluer (cooler) as Kelvin increases', () => {
    const cool = rgb(kelvinToRgb(8000))[2];
    const warm = rgb(kelvinToRgb(2700))[2];
    expect(cool).toBeGreaterThan(warm);
  });

  it('returns a well-formed hex color', () => {
    expect(kelvinToRgb(4000)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
