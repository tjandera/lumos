import { describe, expect, it } from 'vitest';
import {
  compassName,
  DAY_MOMENT_IDS,
  dayMoments,
  describeMoment,
  formatClock,
  type DayMoment,
} from './dayMoments.js';

// Somewhere temperate with a big seasonal swing, and somewhere on the equator where
// there basically isn't one — the point of anchoring to real sunrise/sunset is that
// these two should not produce the same schedule.
const LONDON = { lat: 51.5, lng: -0.13 };
const SINGAPORE = { lat: 1.35, lng: 103.82 };
const TROMSO = { lat: 69.65, lng: 18.96 };

const JUNE = new Date('2026-06-21T12:00:00');
const DECEMBER = new Date('2026-12-21T12:00:00');

const byId = (ms: DayMoment[], id: string) => ms.find((m) => m.id === id)!;

describe('dayMoments', () => {
  it('returns every moment, in chronological order through the day', () => {
    const { moments } = dayMoments(LONDON.lat, LONDON.lng, JUNE);
    expect(moments.map((m) => m.id)).toEqual([...DAY_MOMENT_IDS]);
    for (let i = 1; i < moments.length; i++) {
      expect(moments[i]!.minutes).toBeGreaterThan(moments[i - 1]!.minutes);
    }
  });

  it('puts the sun highest at midday and below the horizon at dawn and dusk', () => {
    const { moments } = dayMoments(LONDON.lat, LONDON.lng, JUNE);
    const midday = byId(moments, 'midday');
    for (const m of moments) {
      if (m.id !== 'midday') expect(m.altitudeDeg).toBeLessThan(midday.altitudeDeg);
    }
    expect(byId(moments, 'dawn').afterDark).toBe(true);
    expect(byId(moments, 'dusk').afterDark).toBe(true);
    expect(byId(moments, 'night').afterDark).toBe(true);
    expect(midday.afterDark).toBe(false);
  });

  it('covers the whole 24 hours, not just the daylight part', () => {
    const { moments } = dayMoments(LONDON.lat, LONDON.lng, JUNE);
    expect(moments).toHaveLength(12);
    // Solar midnight through evening twilight: every phase represented.
    expect(new Set(moments.map((m) => m.phase))).toEqual(
      new Set(['night', 'morningTwilight', 'day', 'eveningTwilight']),
    );
    expect(byId(moments, 'night').minutes).toBeLessThan(60);
  });

  it('brackets sunrise and sunset with the real events', () => {
    const s = dayMoments(LONDON.lat, LONDON.lng, JUNE);
    // `sunrise`/`sunset` sit just inside the horizon crossing so there is a real beam.
    expect(byId(s.moments, 'sunrise').afterDark).toBe(false);
    expect(byId(s.moments, 'sunset').afterDark).toBe(false);
    expect(byId(s.moments, 'sunrise').altitudeDeg).toBeLessThan(3);
    expect(byId(s.moments, 'sunset').altitudeDeg).toBeLessThan(3);
    // ...and the twilight moments either side of them are genuinely dark.
    expect(byId(s.moments, 'dawn').afterDark).toBe(true);
    expect(byId(s.moments, 'dusk').afterDark).toBe(true);
  });

  it('separates deep night from twilight — they need different images', () => {
    const { moments } = dayMoments(LONDON.lat, LONDON.lng, JUNE);
    expect(byId(moments, 'night').phase).toBe('night');
    expect(byId(moments, 'dawn').phase).toBe('morningTwilight');
    expect(byId(moments, 'dusk').phase).toBe('eveningTwilight');
  });

  it('tracks the real season — a London summer day is far longer than its winter one', () => {
    const summer = dayMoments(LONDON.lat, LONDON.lng, JUNE);
    const winter = dayMoments(LONDON.lat, LONDON.lng, DECEMBER);

    const summerLength = summer.sunsetMinutes! - summer.sunriseMinutes!;
    const winterLength = winter.sunsetMinutes! - winter.sunriseMinutes!;
    expect(summerLength).toBeGreaterThan(winterLength + 6 * 60);

    // And the sun genuinely does not get as high in December.
    expect(byId(summer.moments, 'midday').altitudeDeg).toBeGreaterThan(
      byId(winter.moments, 'midday').altitudeDeg + 30,
    );
  });

  it('puts the equator’s midday sun near vertical, unlike London’s', () => {
    const sg = dayMoments(SINGAPORE.lat, SINGAPORE.lng, JUNE);
    expect(byId(sg.moments, 'midday').altitudeDeg).toBeGreaterThan(60);
    // Singapore's day length barely moves between solstices.
    const dec = dayMoments(SINGAPORE.lat, SINGAPORE.lng, DECEMBER);
    const swing = Math.abs(
      sg.sunsetMinutes! - sg.sunriseMinutes! - (dec.sunsetMinutes! - dec.sunriseMinutes!),
    );
    expect(swing).toBeLessThan(60);
  });

  it('gives a bearing only while the sun is actually up', () => {
    const { moments } = dayMoments(LONDON.lat, LONDON.lng, JUNE);
    for (const m of moments) {
      if (m.afterDark) expect(m.bearingDeg).toBeNull();
      else expect(m.bearingDeg).toBeGreaterThanOrEqual(0);
    }
  });

  it('rotates the sun’s bearing with the building’s north offset', () => {
    const straight = dayMoments(LONDON.lat, LONDON.lng, JUNE, 0);
    const turned = dayMoments(LONDON.lat, LONDON.lng, JUNE, 90);
    const a = byId(straight.moments, 'midday').bearingDeg!;
    const b = byId(turned.moments, 'midday').bearingDeg!;
    // Turning the building 90° moves the sun 90° the other way in room-relative terms.
    expect(Math.round(((b - a + 540) % 360) - 180)).toBeCloseTo(-90, -1);
  });

  describe('inside the polar circle', () => {
    it('reports polar day and keeps the sun up the whole time', () => {
      const set = dayMoments(TROMSO.lat, TROMSO.lng, JUNE);
      expect(set.kind).toBe('polarDay');
      expect(set.moments.every((m) => !m.afterDark)).toBe(true);
      expect(set.moments).toHaveLength(DAY_MOMENT_IDS.length);
    });

    it('reports polar night and keeps the sun down the whole time', () => {
      const set = dayMoments(TROMSO.lat, TROMSO.lng, DECEMBER);
      expect(set.kind).toBe('polarNight');
      expect(set.moments.every((m) => m.afterDark)).toBe(true);
    });

    it('still produces valid clock times', () => {
      for (const set of [
        dayMoments(TROMSO.lat, TROMSO.lng, JUNE),
        dayMoments(TROMSO.lat, TROMSO.lng, DECEMBER),
      ]) {
        for (const m of set.moments) {
          expect(m.minutes).toBeGreaterThanOrEqual(0);
          expect(m.minutes).toBeLessThan(1440);
        }
      }
    });
  });
});

describe('describeMoment', () => {
  const { moments } = dayMoments(LONDON.lat, LONDON.lng, JUNE);

  it('describes the sun’s angle and direction when it is up', () => {
    const text = describeMoment(byId(moments, 'midday'));
    expect(text).toMatch(/\d+°/);
    expect(text).toMatch(/north|south|east|west/);
  });

  it('says the lamps take over after dark rather than inventing sunlight', () => {
    const text = describeMoment(byId(moments, 'dusk'));
    expect(text).toMatch(/lamp/i);
    // It must actively rule out direct sun rather than merely omitting it — an image
    // model left to infer "evening" will happily paint a sunbeam across the floor.
    expect(text).toMatch(/no direct sunbeams/i);
  });

  it('calls out long raking shadows only for a low sun', () => {
    expect(describeMoment(byId(moments, 'goldenHour'))).toMatch(/long|raking/i);
    expect(describeMoment(byId(moments, 'midday'))).toMatch(/short/i);
  });

  it('describes deep night as lamps-only, not merely dim daylight', () => {
    const text = describeMoment(byId(moments, 'night'));
    expect(text).toMatch(/only by its own lamps/i);
    expect(text).toMatch(/no sunbeams/i);
  });

  it('distinguishes morning twilight from evening twilight', () => {
    const morning = describeMoment(byId(moments, 'dawn'));
    const evening = describeMoment(byId(moments, 'dusk'));
    expect(morning).toMatch(/has not risen yet/i);
    expect(evening).toMatch(/has just set/i);
    expect(morning).not.toBe(evening);
  });

  it('makes the horizon-crossing moments the most extreme light', () => {
    expect(describeMoment(byId(moments, 'sunrise'))).toMatch(/right at the horizon/i);
    expect(describeMoment(byId(moments, 'sunset'))).toMatch(/right at the horizon/i);
  });
});

describe('compassName', () => {
  it('names the cardinal and intercardinal points', () => {
    expect(compassName(0)).toBe('north');
    expect(compassName(90)).toBe('east');
    expect(compassName(180)).toBe('south');
    expect(compassName(270)).toBe('west');
    expect(compassName(45)).toBe('northeast');
  });

  it('wraps past 360 and handles negatives', () => {
    expect(compassName(360)).toBe('north');
    expect(compassName(-90)).toBe('west');
  });
});

describe('formatClock', () => {
  it('formats minutes as a 24-hour clock', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(540)).toBe('09:00');
    expect(formatClock(1439)).toBe('23:59');
  });
});
