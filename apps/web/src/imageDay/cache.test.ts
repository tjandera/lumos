import { describe, expect, it } from 'vitest';
import { fingerprintPhoto, frameKey } from './cache';

// The IndexedDB read/write paths are exercised in the browser (jsdom has no IndexedDB,
// and a fake adds a dependency for very little). What's worth testing here is the key
// derivation, because a key that's too loose serves someone else's room from cache and
// one that's too tight silently re-bills them for images they already have.

const base = {
  photo: 'data:image/png;base64,AAAABBBBCCCC',
  lat: 51.5074,
  lng: -0.1278,
  northOffsetDeg: 0,
  dateIso: '2026-06-21',
  momentId: 'midday',
};

describe('fingerprintPhoto', () => {
  it('is stable for the same photo', () => {
    expect(fingerprintPhoto(base.photo)).toBe(fingerprintPhoto(base.photo));
  });

  it('differs for different photos', () => {
    expect(fingerprintPhoto(base.photo)).not.toBe(fingerprintPhoto(base.photo + 'X'));
  });

  it('handles a large data URL without walking every byte', () => {
    const big = 'data:image/png;base64,' + 'Q'.repeat(4_000_000);
    const t0 = performance.now();
    expect(fingerprintPhoto(big)).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
    expect(performance.now() - t0).toBeLessThan(100);
  });
});

describe('frameKey', () => {
  it('hits for an identical request', () => {
    expect(frameKey(base)).toBe(frameKey({ ...base }));
  });

  it('misses when the moment changes — each hour is its own image', () => {
    expect(frameKey(base)).not.toBe(frameKey({ ...base, momentId: 'dusk' }));
  });

  it('misses when the photo changes', () => {
    expect(frameKey(base)).not.toBe(frameKey({ ...base, photo: 'data:image/png;base64,ZZZZ' }));
  });

  it('misses when the date changes — the sun is genuinely different', () => {
    expect(frameKey(base)).not.toBe(frameKey({ ...base, dateIso: '2026-12-21' }));
  });

  it('misses when the pin moves meaningfully', () => {
    expect(frameKey(base)).not.toBe(frameKey({ ...base, lat: 55.9 }));
  });

  it('misses when the building is rotated — the light enters different windows', () => {
    expect(frameKey(base)).not.toBe(frameKey({ ...base, northOffsetDeg: 90 }));
  });

  it('quantises coordinates so a tiny map nudge reuses the run', () => {
    // Coordinates are bucketed to 3dp (~100m), over which the sun is identical, so
    // jitter within a bucket must not re-bill six images.
    expect(frameKey({ ...base, lat: 51.5071 })).toBe(frameKey({ ...base, lat: 51.50712 }));

    // Any quantisation has edges: two points a fraction apart but either side of a
    // boundary land in different buckets. The cost of that is one extra cache miss,
    // never a wrong image, so it isn't worth carrying hysteresis to avoid.
    expect(frameKey({ ...base, lat: 51.5074 })).not.toBe(frameKey({ ...base, lat: 51.5075 }));
  });
});
