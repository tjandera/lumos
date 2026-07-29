import { describe, expect, it } from 'vitest';
import { daylightAperture, documentDaylightAperture, FULL_DAYLIGHT_APERTURE_RATIO } from './daylight.js';
import { rectWalls } from './geometry.js';
import { DEFAULT_ROOM_MATERIALS } from './document.js';
import type { Opening, Room } from './schema.js';

/** 5x4m room (20 m²) with four walls, ids wall-0..wall-3 from `rectWalls`. */
function room(w = 5, d = 4): Room {
  return { id: 'room-1', name: 'Room', walls: rectWalls(w, d, 2.5, 0.1), materials: DEFAULT_ROOM_MATERIALS };
}

function opening(over: Partial<Opening> & { wallId: string }): Opening {
  return {
    id: 'o-1',
    kind: 'window',
    offset: 1,
    width: 1.5,
    height: 1.2,
    sillHeight: 0.9,
    glassTint: 0.06,
    covering: { type: 'none', state: 'open' },
    ...over,
  } as Opening;
}

describe('daylightAperture', () => {
  it('reports a sealed room with no openings as admitting no daylight', () => {
    const a = daylightAperture(room(), []);
    expect(a.sealed).toBe(true);
    expect(a.reach).toBe(0);
    expect(a.effectiveAreaM2).toBe(0);
  });

  it('measures the floor area from the room polygon', () => {
    expect(daylightAperture(room(5, 4), []).floorAreaM2).toBeCloseTo(20, 5);
  });

  it('gives full daylight at the benchmark glazing ratio', () => {
    // 20 m² floor x 0.15 = 3 m² of glazing needed for reach 1.
    const r = room();
    const a = daylightAperture(r, [opening({ wallId: r.walls[0]!.id, width: 2.5, height: 1.2 })]);
    expect(a.effectiveAreaM2).toBeCloseTo(3, 5);
    expect(a.reach).toBe(1);
  });

  it('scales linearly below the benchmark', () => {
    const r = room();
    // 1.5 m² of glazing on a 20 m² floor = ratio 0.075 = half the 0.15 benchmark.
    const a = daylightAperture(r, [opening({ wallId: r.walls[0]!.id, width: 1.25, height: 1.2 })]);
    expect(a.reach).toBeCloseTo(0.5, 5);
  });

  it('clamps at 1 for a wall of glass rather than over-brightening', () => {
    const r = room();
    const a = daylightAperture(r, [opening({ wallId: r.walls[0]!.id, width: 4.8, height: 2.4 })]);
    expect(a.reach).toBe(1);
  });

  it('dims a room when blinds are closed, without going fully black', () => {
    const r = room();
    const open = daylightAperture(r, [
      opening({ wallId: r.walls[0]!.id, width: 2.5, height: 1.2, covering: { type: 'blinds', state: 'open' } }),
    ]);
    const shut = daylightAperture(r, [
      opening({ wallId: r.walls[0]!.id, width: 2.5, height: 1.2, covering: { type: 'blinds', state: 'closed' } }),
    ]);
    expect(shut.reach).toBeLessThan(open.reach);
    expect(shut.reach).toBeGreaterThan(0); // light leaks between slats
    expect(shut.covered).toBe(true);
  });

  it('lets closed curtains through more than closed blinds', () => {
    const r = room();
    const curtains = daylightAperture(r, [
      opening({ wallId: r.walls[0]!.id, width: 2.5, height: 1.2, covering: { type: 'curtains', state: 'closed' } }),
    ]);
    const blinds = daylightAperture(r, [
      opening({ wallId: r.walls[0]!.id, width: 2.5, height: 1.2, covering: { type: 'blinds', state: 'closed' } }),
    ]);
    expect(curtains.reach).toBeGreaterThan(blinds.reach);
  });

  it('counts a door as only a partial aperture', () => {
    const r = room();
    const win = daylightAperture(r, [opening({ wallId: r.walls[0]!.id, kind: 'window', width: 2, height: 2 })]);
    const door = daylightAperture(r, [opening({ wallId: r.walls[0]!.id, kind: 'door', width: 2, height: 2, sillHeight: 0 })]);
    expect(door.reach).toBeGreaterThan(0);
    expect(door.reach).toBeLessThan(win.reach);
  });

  it('ignores openings hosted by another room’s wall', () => {
    const a = daylightAperture(room(), [opening({ wallId: 'some-other-rooms-wall', width: 3, height: 2 })]);
    expect(a.sealed).toBe(true);
    expect(a.reach).toBe(0);
  });

  it('sums multiple windows', () => {
    const r = room();
    const one = daylightAperture(r, [opening({ id: 'a', wallId: r.walls[0]!.id, width: 1.25, height: 1.2 })]);
    const two = daylightAperture(r, [
      opening({ id: 'a', wallId: r.walls[0]!.id, width: 1.25, height: 1.2 }),
      opening({ id: 'b', wallId: r.walls[1]!.id, width: 1.25, height: 1.2 }),
    ]);
    expect(two.reach).toBeCloseTo(one.reach * 2, 5);
  });

  it('needs more glazing to light a bigger room to the same level', () => {
    const small = daylightAperture(room(4, 3), [opening({ wallId: room(4, 3).walls[0]!.id, width: 1.5, height: 1.2 })]);
    const big = daylightAperture(room(10, 8), [opening({ wallId: room(10, 8).walls[0]!.id, width: 1.5, height: 1.2 })]);
    expect(big.reach).toBeLessThan(small.reach);
  });

  it('treats a degenerate room as normally lit so a half-drawn plan doesn’t go black', () => {
    const empty: Room = { id: 'r', name: 'R', walls: [], materials: DEFAULT_ROOM_MATERIALS };
    const a = daylightAperture(empty, []);
    expect(a.reach).toBe(1);
    expect(a.sealed).toBe(false);
  });

  it('does not flag a genuinely tiny window as "covered"', () => {
    // A porthole is dim because it's small, not because something is drawn over it —
    // telling the user to open the blinds would be wrong advice.
    const r = room();
    const a = daylightAperture(r, [opening({ wallId: r.walls[0]!.id, width: 0.3, height: 0.3 })]);
    expect(a.reach).toBeLessThan(0.15);
    expect(a.covered).toBe(false);
  });

  it('exposes the benchmark ratio it normalises against', () => {
    expect(FULL_DAYLIGHT_APERTURE_RATIO).toBeGreaterThan(0);
    expect(FULL_DAYLIGHT_APERTURE_RATIO).toBeLessThan(1);
  });
});

describe('documentDaylightAperture', () => {
  it('takes the brightest room, since sky and IBL terms are global', () => {
    const dark: Room = { ...room(), id: 'dark', walls: rectWalls(5, 4, 2.5, 0.1).map((w) => ({ ...w, id: `dark-${w.id}` })) };
    const bright: Room = { ...room(), id: 'bright', walls: rectWalls(5, 4, 2.5, 0.1).map((w) => ({ ...w, id: `bright-${w.id}` })) };
    const openings = [opening({ wallId: bright.walls[0]!.id, width: 2.5, height: 1.2 })];

    const combined = documentDaylightAperture([dark, bright], openings);

    expect(combined.reach).toBe(1);
    expect(daylightAperture(dark, openings).reach).toBe(0);
  });

  it('returns a lit default for a document with no rooms yet', () => {
    const a = documentDaylightAperture([], []);
    expect(a.reach).toBe(1);
    expect(a.sealed).toBe(false);
  });

  it('reports sealed when every room is sealed', () => {
    expect(documentDaylightAperture([room()], []).sealed).toBe(true);
  });
});
