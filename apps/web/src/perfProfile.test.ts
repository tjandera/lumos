import { describe, expect, it } from 'vitest';
import {
  contactShadowFrames,
  initialQuality,
  maxPixelRatio,
  powerPreference,
  type DeviceSignals,
} from './perfProfile';

const base: DeviceSignals = {
  cores: 8,
  memoryGb: 16,
  pixelRatio: 1,
  viewportArea: 1920 * 1080,
  isMobile: false,
};

describe('initialQuality', () => {
  it('starts a discrete-GPU desktop at high', () => {
    expect(initialQuality({ ...base, cores: 16, gpu: 'NVIDIA GeForce RTX 4070' })).toBe('high');
  });

  it('starts an integrated-graphics laptop below high', () => {
    // The case this exists for: holds frame rate fine, but pays for it in heat.
    expect(initialQuality({ ...base, gpu: 'Intel(R) Iris(TM) Plus Graphics' })).not.toBe('high');
  });

  it('always starts mobile at low, whatever the GPU claims', () => {
    expect(initialQuality({ ...base, isMobile: true, cores: 8, gpu: 'Apple GPU' })).toBe('low');
  });

  it('respects prefers-reduced-motion as a go-easy signal', () => {
    expect(initialQuality({ ...base, gpu: 'NVIDIA GeForce RTX 4090', cores: 24, prefersReducedMotion: true })).toBe('low');
  });

  it('steps down for a large high-DPI display, which multiplies fragment work', () => {
    const laptop = initialQuality({ ...base, gpu: 'NVIDIA GeForce RTX 4070', cores: 16 });
    const bigRetina = initialQuality({
      ...base,
      gpu: 'NVIDIA GeForce RTX 4070',
      cores: 16,
      pixelRatio: 2,
      viewportArea: 2560 * 1440,
    });
    expect(laptop).toBe('high');
    expect(bigRetina).not.toBe('high');
  });

  it('penalises very low core counts and small memory', () => {
    expect(initialQuality({ ...base, cores: 2, memoryGb: 4, gpu: undefined })).toBe('low');
  });

  it('lands mid-range hardware in the middle rather than at an extreme', () => {
    expect(initialQuality({ ...base, gpu: undefined })).toBe('med');
  });

  it('copes with every optional signal missing', () => {
    const q = initialQuality({ pixelRatio: 1, viewportArea: 1_000_000, isMobile: false });
    expect(['low', 'med', 'high']).toContain(q);
  });

  it('does not treat a software rasteriser as capable', () => {
    expect(initialQuality({ ...base, cores: 16, gpu: 'SwiftShader Device (LLVM)' })).not.toBe('high');
  });
});

describe('maxPixelRatio', () => {
  it('never exceeds the display’s own ratio', () => {
    expect(maxPixelRatio('high', 1)).toBe(1);
    expect(maxPixelRatio('med', 1)).toBe(1);
  });

  it('caps a Retina display well below native at lower tiers', () => {
    expect(maxPixelRatio('high', 2)).toBe(2);
    expect(maxPixelRatio('med', 2)).toBe(1.5);
    expect(maxPixelRatio('low', 2)).toBe(1);
  });

  it('caps hard on very high-density screens', () => {
    // A 3x phone screen would otherwise be 9x the fragment work of 1x.
    expect(maxPixelRatio('low', 3)).toBe(1);
    expect(maxPixelRatio('high', 3)).toBe(2);
  });
});

describe('powerPreference', () => {
  it('only asks for the discrete GPU at the top tier', () => {
    expect(powerPreference('high')).toBe('high-performance');
    expect(powerPreference('med')).toBe('default');
    expect(powerPreference('low')).toBe('low-power');
  });
});

describe('contactShadowFrames', () => {
  it('is always finite — the old Infinity re-rendered a whole pass every frame', () => {
    for (const q of ['low', 'med', 'high'] as const) {
      expect(Number.isFinite(contactShadowFrames(q))).toBe(true);
      expect(contactShadowFrames(q)).toBeGreaterThan(0);
    }
  });
});
