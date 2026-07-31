/**
 * The handful of moments a day's light actually turns on, derived from the real sun for
 * a given place and date.
 *
 * This exists so image generation can be told what the light is *physically doing* —
 * "sun 8° above the horizon, bearing 112°, forty minutes after sunrise" — rather than
 * being asked for a vibe like "make it morning". The times are real: solar noon in
 * Reykjavík in December is a different animal from solar noon in Singapore, and the
 * generated images should reflect that.
 *
 * Pure maths, no rendering and no network, so it's cheap to test against known places.
 */
import { daylightTimes, sunVector } from './sunlight.js';
import { RAD2DEG } from './units.js';

export type DayMomentId =
  | 'night'
  | 'preDawn'
  | 'dawn'
  | 'sunrise'
  | 'earlyMorning'
  | 'lateMorning'
  | 'midday'
  | 'earlyAfternoon'
  | 'lateAfternoon'
  | 'goldenHour'
  | 'sunset'
  | 'dusk';

/**
 * A full 24 hours, in clock order.
 *
 * Anchored to genuine solar events — solar midnight, sunrise, solar noon, sunset — rather
 * than fixed hours, so the set stretches and compresses with the real day. Twelve rather
 * than a tidier six because the interesting transitions cluster at the ends: sunrise,
 * golden hour, sunset and dusk all happen within a couple of hours of each other and look
 * nothing alike, while the middle of the day changes slowly.
 */
export const DAY_MOMENT_IDS: readonly DayMomentId[] = [
  'night',
  'preDawn',
  'dawn',
  'sunrise',
  'earlyMorning',
  'lateMorning',
  'midday',
  'earlyAfternoon',
  'lateAfternoon',
  'goldenHour',
  'sunset',
  'dusk',
];

/**
 * Which part of the cycle a moment sits in.
 *
 * Kept separate from altitude because "just below the horizon" and "the middle of the
 * night" are both `afterDark` but want completely different images — one is a bright
 * blue-grey sky with lamps starting to matter, the other is lamps and nothing else.
 */
export type DayPhase = 'night' | 'morningTwilight' | 'day' | 'eveningTwilight';

/**
 * A representative half-dozen, for when a full twelve is more time and money than the
 * question deserves.
 *
 * Chosen for how the light *enters a room*, not for even spacing: lamps-only, a low sun
 * raking in from one side, a high sun with short shadows, a low sun raking in from the
 * other side, warm golden light, and blue ambient with the lamps taking over. Morning and
 * afternoon low sun are both kept because in a real room they hit different walls — which
 * is exactly what someone deciding where to put a sofa wants to see.
 */
export const ESSENTIAL_MOMENT_IDS: readonly DayMomentId[] = [
  'night',
  'sunrise',
  'midday',
  'lateAfternoon',
  'goldenHour',
  'dusk',
];

export interface DayMoment {
  id: DayMomentId;
  label: string;
  /** Local clock time, minutes from midnight. */
  minutes: number;
  /** Sun altitude in degrees. Negative means below the horizon. */
  altitudeDeg: number;
  /**
   * Sun bearing in degrees clockwise from the building's true north, or null when the
   * sun is below the horizon and direction no longer means anything indoors.
   */
  bearingDeg: number | null;
  /** Sun is below the horizon — whatever lamps exist are carrying the room. */
  afterDark: boolean;
  /** Which part of the cycle this is, for prompts and UI grouping. */
  phase: DayPhase;
}

/** How the sky behaves on the requested date at the requested latitude. */
export type DayKind = 'normal' | 'polarDay' | 'polarNight';

export interface DayMomentSet {
  kind: DayKind;
  moments: DayMoment[];
  sunriseMinutes: number | null;
  sunsetMinutes: number | null;
}

const LABELS: Record<DayMomentId, string> = {
  night: 'Night',
  preDawn: 'Pre-dawn',
  dawn: 'Dawn',
  sunrise: 'Sunrise',
  earlyMorning: 'Early morning',
  lateMorning: 'Late morning',
  midday: 'Midday',
  earlyAfternoon: 'Early afternoon',
  lateAfternoon: 'Late afternoon',
  goldenHour: 'Golden hour',
  sunset: 'Sunset',
  dusk: 'Dusk',
};

const MINUTES_PER_DAY = 1440;

/** Wrap into [0, 1440) so an offset either side of midnight stays a valid clock time. */
const wrapMinutes = (m: number): number => ((m % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

/**
 * Clock times here are **local solar time at the room**, derived from longitude
 * (15° per hour), not from the machine's timezone and not from a tz database.
 *
 * Using `getHours()` would read these instants in whatever timezone the browser or
 * server happens to be in — London's sunrise shows up as 11:43 on a Singapore machine,
 * which then reorders the whole day. Solar time is timezone-free, needs no dependency,
 * and is the honest quantity for a feature about where the sun physically is; it lands
 * within about half an hour of civil time, and ignores DST and political zone borders.
 */
const solarMinutes = (d: Date, lng: number): number =>
  wrapMinutes(d.getUTCHours() * 60 + d.getUTCMinutes() + (lng / 15) * 60);

/** The absolute instant at a given local-solar clock time on `date`'s UTC day. */
const atSolarMinutes = (date: Date, minutes: number, lng: number): Date => {
  const utcMinutes = wrapMinutes(minutes) - (lng / 15) * 60;
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCMinutes(d.getUTCMinutes() + utcMinutes);
  return d;
};

const COMPASS = [
  'north',
  'north-northeast',
  'northeast',
  'east-northeast',
  'east',
  'east-southeast',
  'southeast',
  'south-southeast',
  'south',
  'south-southwest',
  'southwest',
  'west-southwest',
  'west',
  'west-northwest',
  'northwest',
  'north-northwest',
] as const;

/** Compass bearing in degrees → the nearest 16-point name. */
export function compassName(bearingDeg: number): string {
  const i = Math.round(wrapDegrees(bearingDeg) / 22.5) % 16;
  return COMPASS[i]!;
}

const wrapDegrees = (d: number): number => ((d % 360) + 360) % 360;

/**
 * Civil twilight is the usable one here: above about -6° there is still real light in the
 * sky and a room reads as "early" rather than "dark". Below that, lamps are the story.
 */
const CIVIL_TWILIGHT_DEG = -6;

/**
 * The sun is *visible* slightly before its centre reaches geometric zero: atmospheric
 * refraction lifts the disc by about 0.57°, and the disc's own radius adds another 0.27°.
 * That is why almanacs put sunrise at a centre altitude of -0.833° rather than 0.
 *
 * Using plain `altitude <= 0` marked the moment of sunrise as "after dark", which would
 * have told the image model there was no sun at the exact moment there is a sun sitting
 * on the horizon — the most dramatic light of the whole day.
 */
const HORIZON_DEG = -0.833;

function phaseFor(altitudeDeg: number, minutes: number, noonMin: number): DayPhase {
  if (altitudeDeg > HORIZON_DEG) return 'day';
  if (altitudeDeg <= CIVIL_TWILIGHT_DEG) return 'night';
  // Which side of noon decides whether the light is arriving or leaving.
  const beforeNoon = ((minutes - noonMin + 1440) % 1440) > 720;
  return beforeNoon ? 'morningTwilight' : 'eveningTwilight';
}

/**
 * Sample the sun at one instant, in the building's own frame.
 *
 * `sunVector` already folds in `trueNorthOffsetDeg`, so x/z here are relative to the
 * room's axes; atan2(x, z) turns that back into a bearing where 0 is the room's north.
 */
function sampleSun(
  lat: number,
  lng: number,
  when: Date,
  trueNorthOffsetDeg: number,
): { altitudeDeg: number; bearingDeg: number | null } {
  const v = sunVector(lat, lng, when, trueNorthOffsetDeg);
  const altitudeDeg = v.altitude * RAD2DEG;
  // Same threshold as `afterDark`: at sunrise the direction the light comes from is the
  // single most important thing to tell the image model, so it must not be null there.
  if (altitudeDeg <= HORIZON_DEG) return { altitudeDeg, bearingDeg: null };
  return { altitudeDeg, bearingDeg: wrapDegrees(Math.atan2(v.x, v.z) * RAD2DEG) };
}

/**
 * The six moments worth generating for a location and date.
 *
 * Anchored to real sunrise / solar noon / sunset rather than fixed clock hours, so
 * "golden hour" is genuinely the hour before that day's sunset wherever you are. Inside
 * the polar circles there may be no sunrise or sunset at all; those days are spread
 * evenly across 24 hours instead, and reported via `kind` so the caller can say so.
 */
export function dayMoments(
  lat: number,
  lng: number,
  date: Date,
  trueNorthOffsetDeg = 0,
): DayMomentSet {
  const times = daylightTimes(lat, lng, date);
  const noonMin = solarMinutes(times.solarNoon, lng);

  const sample = (minutes: number) =>
    sampleSun(lat, lng, atSolarMinutes(date, minutes, lng), trueNorthOffsetDeg);

  // No sunrise/sunset: either the sun never sets or it never rises. `daylightTimes`
  // reports both as nulls, so the altitude at solar noon is what tells them apart.
  if (!times.sunrise || !times.sunset) {
    const noonAlt = sample(noonMin).altitudeDeg;
    const kind: DayKind = noonAlt > 0 ? 'polarDay' : 'polarNight';
    const moments = DAY_MOMENT_IDS.map((id, i) => {
      // Spread across the whole 24 hours, centred on solar noon.
      const minutes = wrapMinutes(noonMin + (i - 2.5) * (MINUTES_PER_DAY / DAY_MOMENT_IDS.length));
      const s = sample(minutes);
      return {
        id,
        label: LABELS[id],
        minutes,
        altitudeDeg: s.altitudeDeg,
        bearingDeg: s.bearingDeg,
        afterDark: s.altitudeDeg <= HORIZON_DEG,
        phase: phaseFor(s.altitudeDeg, minutes, noonMin),
      };
    });
    return { kind, moments, sunriseMinutes: null, sunsetMinutes: null };
  }

  const riseMin = solarMinutes(times.sunrise, lng);
  const setMin = solarMinutes(times.sunset, lng);

  // Fractions of the real morning/afternoon rather than fixed clock offsets, so these
  // stay meaningful on a 6-hour winter day as well as a 16-hour summer one. The twilight
  // moments use fixed minute offsets instead, because twilight length depends on latitude,
  // not on how long the day is.
  const offsets: Record<DayMomentId, number> = {
    night: noonMin + 720, // solar midnight
    preDawn: riseMin - 55,
    dawn: riseMin - 22,
    sunrise: riseMin + 4, // just clear of the horizon, so there is a visible sunbeam
    earlyMorning: riseMin + (noonMin - riseMin) * 0.28,
    lateMorning: riseMin + (noonMin - riseMin) * 0.68,
    midday: noonMin,
    earlyAfternoon: noonMin + (setMin - noonMin) * 0.3,
    lateAfternoon: noonMin + (setMin - noonMin) * 0.62,
    goldenHour: setMin - 40,
    sunset: setMin - 4,
    dusk: setMin + 26,
  };

  const moments = DAY_MOMENT_IDS.map((id) => {
    const minutes = wrapMinutes(Math.round(offsets[id]));
    const s = sample(minutes);
    return {
      id,
      label: LABELS[id],
      minutes,
      altitudeDeg: s.altitudeDeg,
      bearingDeg: s.bearingDeg,
      afterDark: s.altitudeDeg <= HORIZON_DEG,
      phase: phaseFor(s.altitudeDeg, minutes, noonMin),
    };
  });

  return { kind: 'normal', moments, sunriseMinutes: riseMin, sunsetMinutes: setMin };
}

/**
 * A plain-language account of what the sun is doing, for an image prompt.
 *
 * Deliberately physical and specific — angle, direction, how hard the shadows are — since
 * that is what an image model can act on. "Golden hour" alone gets you a stock filter;
 * "sun 6° above the horizon from the west-southwest, long shadows raking across the
 * floor" gets you this room at that hour.
 */
export function describeMoment(m: DayMoment): string {
  if (m.phase === 'night') {
    return (
      'The sun is well below the horizon and the sky gives almost nothing. No sunbeams and no ' +
      'sun patches anywhere. The room is lit only by its own lamps — warm pools of light around ' +
      'each fitting, deep shadow everywhere else, and windows reading as dark rectangles.'
    );
  }

  if (m.phase === 'morningTwilight') {
    return (
      'The sun has not risen yet, but the sky is already pale. Cool blue-grey ambient light through ' +
      'the windows, no direct sunbeams and no cast sun patches, soft shadowless illumination, ' +
      'and any lamps still on reading warm against the cold daylight.'
    );
  }

  if (m.phase === 'eveningTwilight') {
    return (
      'The sun has just set. Cool blue ambient light from the sky through the windows, no direct ' +
      'sunbeams, and the room’s own lamps now providing most of the visible light with warm pools ' +
      'around them.'
    );
  }

  const alt = Math.max(0, Math.round(m.altitudeDeg));
  const dir = m.bearingDeg === null ? 'the window side' : `the ${compassName(m.bearingDeg)}`;

  if (alt <= 3) {
    return (
      `The sun is right at the horizon, about ${alt}° up, from ${dir}. ` +
      'Intense low orange-red light streaming almost horizontally through the windows, extremely long ' +
      'shadows thrown right across the floor and up the far wall, and a strong warm glow on everything it touches.'
    );
  }
  if (alt < 12) {
    return (
      `Low sun about ${alt}° above the horizon, shining in from ${dir}. ` +
      'Long raking shadows stretched across the floor, warm golden-orange light with a strong directional beam ' +
      'through the windows, and bright highlights where it lands.'
    );
  }
  if (alt < 35) {
    return (
      `Sun about ${alt}° above the horizon, from ${dir}. ` +
      'Clear directional daylight with well-defined shadows angled across the room and a warm, bright cast on the surfaces it reaches.'
    );
  }
  return (
    `High sun about ${alt}° above the horizon, from ${dir}. ` +
    'Bright neutral daylight, short shadows pooled close beneath furniture, and strong even illumination through the windows.'
  );
}

/** `540` → `"09:00"`. */
export function formatClock(minutes: number): string {
  const m = wrapMinutes(Math.round(minutes));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
