import { describe, expect, it } from 'vitest';
import { coarsenDocumentForSharing, coarsenSite, SHARE_COORD_DECIMALS } from './privacy.js';
import { createEmptyDocument } from './document.js';
import type { Site } from './schema.js';

const site = (lat: number, lng: number, trueNorthOffsetDeg = 0): Site => ({ lat, lng, trueNorthOffsetDeg });

describe('coarsenSite', () => {
  it('rounds a building-precision fix down to ~1km', () => {
    // A specific address in Singapore, to full float precision.
    const exact = site(1.2966426, 103.8764481);
    expect(coarsenSite(exact)).toEqual(site(1.3, 103.88));
  });

  it('keeps the north offset exact — it describes the building, not where it is', () => {
    expect(coarsenSite(site(51.5074, -0.1278, 37.4)).trueNorthOffsetDeg).toBe(37.4);
  });

  it('handles southern and western hemispheres without producing -0', () => {
    const out = coarsenSite(site(-33.8688, -0.001));
    expect(out.lat).toBe(-33.87);
    expect(Object.is(out.lng, -0)).toBe(false);
    expect(out.lng).toBe(0);
  });

  it('is idempotent — coarsening an already-coarse site changes nothing', () => {
    const once = coarsenSite(site(40.7128, -74.006));
    expect(coarsenSite(once)).toEqual(once);
  });

  it('does not mutate its input', () => {
    const original = site(1.2966426, 103.8764481);
    coarsenSite(original);
    expect(original.lat).toBe(1.2966426);
  });

  it('never leaks precision beyond the documented decimal count', () => {
    for (const [lat, lng] of [
      [12.3456789, -98.7654321],
      [-89.999999, 179.999999],
      [0.005, -0.005],
    ] as const) {
      const out = coarsenSite(site(lat, lng));
      for (const v of [out.lat, out.lng]) {
        const decimals = (String(v).split('.')[1] ?? '').length;
        expect(decimals).toBeLessThanOrEqual(SHARE_COORD_DECIMALS);
      }
    }
  });

  it('stays within schema bounds at the extremes', () => {
    const out = coarsenSite(site(-89.999999, 179.999999));
    expect(out.lat).toBeGreaterThanOrEqual(-90);
    expect(out.lng).toBeLessThanOrEqual(180);
  });
});

describe('coarsenDocumentForSharing', () => {
  it('coarsens the site but leaves the rest of the document identical', () => {
    const doc = createEmptyDocument();
    doc.site = site(1.2966426, 103.8764481, 12);

    const shared = coarsenDocumentForSharing(doc);

    expect(shared.site).toEqual(site(1.3, 103.88, 12));
    // Everything that isn't the site must survive untouched.
    expect({ ...shared, site: null }).toEqual({ ...doc, site: null });
  });

  it('passes through a document with no site rather than throwing', () => {
    // This runs on the save/export path. A partial or pre-`site` document has no
    // coordinates to leak, and blowing up here would make the design unsaveable.
    const partial = { meta: { id: 'x', name: 'N' }, rooms: [], furniture: [], lights: [] } as unknown as Parameters<
      typeof coarsenDocumentForSharing
    >[0];
    expect(() => coarsenDocumentForSharing(partial)).not.toThrow();
    expect(coarsenDocumentForSharing(partial)).toBe(partial);
  });

  it('passes through a site with non-numeric coordinates rather than producing NaN', () => {
    const bad = {
      meta: { id: 'x', name: 'N' },
      site: { lat: undefined, lng: null, trueNorthOffsetDeg: 0 },
      rooms: [],
    } as unknown as Parameters<typeof coarsenDocumentForSharing>[0];
    expect(() => coarsenDocumentForSharing(bad)).not.toThrow();
    expect(coarsenDocumentForSharing(bad)).toBe(bad);
  });

  it('leaves the caller’s own document at full precision', () => {
    const doc = createEmptyDocument();
    doc.site = site(1.2966426, 103.8764481);

    coarsenDocumentForSharing(doc);

    expect(doc.site.lat).toBe(1.2966426);
  });
});
