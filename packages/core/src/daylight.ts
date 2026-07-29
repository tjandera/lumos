/**
 * How much daylight a room can physically admit.
 *
 * The renderer used to light every room with the same ambient + image-based lighting
 * regardless of whether it had a single window, so an interior box with no openings
 * looked exactly as bright as a sunroom. That reads as "the lighting is fake" the
 * moment anyone tests the obvious case. This computes an aperture-driven daylight
 * factor from the room's own openings, which the renderer then uses to scale every
 * daylight term (sun, sky, IBL). Artificial fixtures are unaffected — a windowless
 * room is meant to be lit by its lamps, not by nothing.
 *
 * The model is deliberately simple and documented rather than pseudo-photometric: a
 * ratio of effective glazed area to floor area, normalised against a "generously
 * daylit" benchmark. It is a plausibility model for a design tool, not a daylight
 * compliance calculation.
 */

import type { Covering, Opening, Room } from './schema.js';
import { polygonAbsArea, roomCorners } from './geometry.js';

/**
 * Window-to-floor area ratio treated as fully daylit. Habitable-room codes commonly
 * require glazing around 10% of floor area; 15% is comfortably above that, so rooms
 * at or beyond it get the full daylight term and only poorly-glazed rooms are dimmed.
 */
export const FULL_DAYLIGHT_APERTURE_RATIO = 0.15;

/**
 * Fraction of daylight a covering passes. Closed curtains still glow (fabric is
 * translucent and scatters light into the room); closed blinds block far harder but
 * never perfectly, because light leaks around and between slats. Neither reaches
 * zero — a room with a curtained window is dim, not pitch black.
 */
const COVERING_TRANSMISSION: Record<Covering['type'], { open: number; closed: number }> = {
  none: { open: 1, closed: 1 }, // nothing to draw
  curtains: { open: 0.92, closed: 0.18 },
  blinds: { open: 0.9, closed: 0.06 },
};

/**
 * Weight applied to doors. The schema has no interior/exterior flag, so a door might
 * open onto a garden or onto a windowless hallway; counting one as a full-value
 * aperture would make any room with a door self-lighting. This treats a door as a
 * modest, uncertain light source rather than guessing.
 */
const DOOR_APERTURE_WEIGHT = 0.25;

export interface DaylightAperture {
  /** Effective glazed area in m², after coverings and door weighting. */
  effectiveAreaM2: number;
  floorAreaM2: number;
  /** 0 = admits no daylight at all, 1 = generously daylit. */
  reach: number;
  /** No window or door on this room's walls — daylight is physically impossible. */
  sealed: boolean;
  /** Has openings, but coverings are drawn over effectively all of them. */
  covered: boolean;
}

/** Effective daylight-passing area of one opening, in m². */
function openingEffectiveArea(opening: Opening): number {
  const area = opening.width * opening.height;
  if (opening.kind === 'door') return area * DOOR_APERTURE_WEIGHT;
  const spec = COVERING_TRANSMISSION[opening.covering?.type ?? 'none'] ?? COVERING_TRANSMISSION.none;
  return area * (opening.covering?.state === 'closed' ? spec.closed : spec.open);
}

/**
 * Daylight-admitting capacity of `room`, considering only the openings that sit on its
 * own walls. `openings` may be the whole document's list; anything hosted by another
 * room's wall is ignored.
 */
export function daylightAperture(room: Room, openings: Opening[]): DaylightAperture {
  const wallIds = new Set(room.walls.map((w) => w.id));
  const mine = (openings ?? []).filter((o) => wallIds.has(o.wallId));

  const floorAreaM2 = polygonAbsArea(roomCorners(room));
  const effectiveAreaM2 = mine.reduce((sum, o) => sum + openingEffectiveArea(o), 0);

  // A degenerate room (no corners / zero area) can't be reasoned about — treat it as
  // normally lit so a half-drawn plan doesn't go black while the user is drawing it.
  if (floorAreaM2 <= 0) {
    return { effectiveAreaM2, floorAreaM2: 0, reach: 1, sealed: false, covered: false };
  }

  const ratio = effectiveAreaM2 / floorAreaM2;
  const reach = Math.max(0, Math.min(1, ratio / FULL_DAYLIGHT_APERTURE_RATIO));

  const rawArea = mine.reduce((sum, o) => sum + o.width * o.height, 0);
  return {
    effectiveAreaM2,
    floorAreaM2,
    reach,
    sealed: mine.length === 0,
    // Openings exist and are physically big enough to matter, but coverings have cut
    // the light to almost nothing — worth telling the user, since it's one click to undo.
    covered: mine.length > 0 && rawArea / floorAreaM2 >= FULL_DAYLIGHT_APERTURE_RATIO * 0.5 && reach < 0.15,
  };
}

/** Daylight capacity across a whole document — the brightest room wins, since the
 *  camera can be anywhere and the scene's sky/IBL terms are global. */
export function documentDaylightAperture(rooms: Room[], openings: Opening[]): DaylightAperture {
  if (!rooms || rooms.length === 0) {
    return { effectiveAreaM2: 0, floorAreaM2: 0, reach: 1, sealed: false, covered: false };
  }
  let best: DaylightAperture | null = null;
  for (const room of rooms) {
    const a = daylightAperture(room, openings);
    if (!best || a.reach > best.reach) best = a;
  }
  return best!;
}
