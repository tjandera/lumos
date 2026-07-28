/**
 * Location privacy for designs that leave the device.
 *
 * The schema already refuses address-like keys outright (see schema.pii.test.ts), so
 * a street address can never be stored. But `site.lat/lng` are plain numbers, and once
 * a user drops a pin on a map they are pinning their actual home — at full float
 * precision that's a sub-metre fix on where someone lives, travelling inside every
 * exported file and share link.
 *
 * The project rule (CLAUDE.md, IMPLEMENTATION_PLAN.md item 8) is that only *coarse*
 * lat/lng travel with a design. This module is where "coarse" is defined, so export
 * and share-link paths can't each invent their own answer.
 *
 * Precision: 2 decimal places. One hundredth of a degree of latitude is ~1.1 km
 * everywhere; for longitude it's ~1.1 km at the equator, shrinking toward the poles,
 * so 2dp is a neighbourhood, never a building. That is far finer than sun position
 * needs — solar azimuth/elevation shift imperceptibly over ~1 km — so coarsening
 * costs the simulation nothing. It also matches what the lighting panel already
 * displays back to the user, so the shared value is the value they saw.
 */

import type { SceneDocument, Site } from './schema.js';

/** Decimal places kept on coordinates that leave the device (~1 km). */
export const SHARE_COORD_DECIMALS = 2;

const roundTo = (v: number, decimals: number): number => {
  const f = 10 ** decimals;
  // `+ 0` normalises the -0 that Math.round produces for small negative inputs, so a
  // coarsened western/southern coordinate serialises as 0 rather than -0.
  return Math.round(v * f) / f + 0;
};

/** Reduce a site's coordinates to sharing precision. The north offset is not location
 *  data — it describes which way the building faces — so it passes through exact. */
export function coarsenSite(site: Site): Site {
  return {
    ...site,
    lat: roundTo(site.lat, SHARE_COORD_DECIMALS),
    lng: roundTo(site.lng, SHARE_COORD_DECIMALS),
  };
}

/** A document that predates `site`, or a partial one built by a caller/test, has no
 *  coordinates in it — nothing to coarsen and nothing to leak. */
function hasSite(doc: SceneDocument): boolean {
  const site: unknown = doc.site;
  return !!site && typeof site === 'object'
    && typeof (site as Site).lat === 'number' && typeof (site as Site).lng === 'number';
}

/**
 * Return a copy of the document safe to hand to anyone else — an export file, a share
 * link, an API payload. Call this on every outbound path; never serialise a raw
 * document. The in-memory/localStorage document deliberately keeps full precision, so
 * the owner's own map pin stays exactly where they put it.
 */
export function coarsenDocumentForSharing(doc: SceneDocument): SceneDocument {
  // This sits on the save/export path, so it must never throw: a malformed or partial
  // document should still be saveable, and one without coordinates has nothing to hide.
  if (!hasSite(doc)) return doc;
  return { ...doc, site: coarsenSite(doc.site) };
}
