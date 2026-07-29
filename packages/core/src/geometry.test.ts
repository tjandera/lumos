import { describe, expect, it } from 'vitest';
import { polygonAbsArea, rectWalls, roomCorners } from './geometry.js';
import { DEFAULT_ROOM_MATERIALS } from './document.js';
import type { Room, Wall } from './schema.js';

const room = (walls: Wall[]): Room => ({ id: 'r', name: 'R', walls, materials: DEFAULT_ROOM_MATERIALS });

describe('roomCorners', () => {
  it('recovers a rectangle from rectWalls, whose walls are not in perimeter order', () => {
    // Regression: rectWalls emits N, S, W, E. Reading that in array order traced a
    // self-intersecting bowtie whose shoelace area cancelled to exactly 0, so every
    // floor-area consumer saw a 0 m² room.
    const corners = roomCorners(room(rectWalls(5, 4, 2.5, 0.1)));
    expect(corners).toHaveLength(4);
    expect(polygonAbsArea(corners)).toBeCloseTo(20, 6);
  });

  it('agrees with the stated dimensions across sizes', () => {
    for (const [w, d] of [[3, 3], [10, 4], [1.5, 7.25]] as const) {
      expect(polygonAbsArea(roomCorners(room(rectWalls(w, d, 2.5, 0.1))))).toBeCloseTo(w * d, 6);
    }
  });

  it('still handles walls that are already in perimeter order', () => {
    const ordered: Wall[] = [
      { id: 'a', start: { x: 0, z: 0 }, end: { x: 4, z: 0 }, thickness: 0.1, height: 2.5 },
      { id: 'b', start: { x: 4, z: 0 }, end: { x: 4, z: 3 }, thickness: 0.1, height: 2.5 },
      { id: 'c', start: { x: 4, z: 3 }, end: { x: 0, z: 3 }, thickness: 0.1, height: 2.5 },
      { id: 'd', start: { x: 0, z: 3 }, end: { x: 0, z: 0 }, thickness: 0.1, height: 2.5 },
    ];
    const corners = roomCorners(room(ordered));
    expect(corners).toHaveLength(4);
    expect(polygonAbsArea(corners)).toBeCloseTo(12, 6);
  });

  it('follows a wall stored back-to-front, since walls are undirected segments', () => {
    const flipped: Wall[] = [
      { id: 'a', start: { x: 0, z: 0 }, end: { x: 4, z: 0 }, thickness: 0.1, height: 2.5 },
      // reversed: end meets the previous wall's tip, not start
      { id: 'b', start: { x: 4, z: 3 }, end: { x: 4, z: 0 }, thickness: 0.1, height: 2.5 },
      { id: 'c', start: { x: 4, z: 3 }, end: { x: 0, z: 3 }, thickness: 0.1, height: 2.5 },
      { id: 'd', start: { x: 0, z: 3 }, end: { x: 0, z: 0 }, thickness: 0.1, height: 2.5 },
    ];
    expect(polygonAbsArea(roomCorners(room(flipped)))).toBeCloseTo(12, 6);
  });

  it('handles an L-shaped room', () => {
    // 4x4 square with a 2x2 bite taken out of one corner = 12 m².
    const l: Wall[] = [
      { id: '1', start: { x: 0, z: 0 }, end: { x: 4, z: 0 }, thickness: 0.1, height: 2.5 },
      { id: '2', start: { x: 4, z: 0 }, end: { x: 4, z: 2 }, thickness: 0.1, height: 2.5 },
      { id: '3', start: { x: 4, z: 2 }, end: { x: 2, z: 2 }, thickness: 0.1, height: 2.5 },
      { id: '4', start: { x: 2, z: 2 }, end: { x: 2, z: 4 }, thickness: 0.1, height: 2.5 },
      { id: '5', start: { x: 2, z: 4 }, end: { x: 0, z: 4 }, thickness: 0.1, height: 2.5 },
      { id: '6', start: { x: 0, z: 4 }, end: { x: 0, z: 0 }, thickness: 0.1, height: 2.5 },
    ];
    const corners = roomCorners(room(l));
    expect(corners).toHaveLength(6);
    expect(polygonAbsArea(corners)).toBeCloseTo(12, 6);
  });

  it('is order-independent — shuffling the wall array gives the same area', () => {
    const walls = rectWalls(6, 4, 2.5, 0.1);
    const shuffles = [
      [walls[2], walls[0], walls[3], walls[1]],
      [walls[3], walls[2], walls[1], walls[0]],
      [walls[1], walls[3], walls[0], walls[2]],
    ] as Wall[][];
    for (const s of shuffles) {
      expect(polygonAbsArea(roomCorners(room(s)))).toBeCloseTo(24, 6);
    }
  });

  it('returns no corners for a room with no walls', () => {
    expect(roomCorners(room([]))).toEqual([]);
  });

  it('emits the distinct corners of an unclosed run of walls without throwing', () => {
    const open: Wall[] = [
      { id: 'a', start: { x: 0, z: 0 }, end: { x: 4, z: 0 }, thickness: 0.1, height: 2.5 },
      { id: 'b', start: { x: 4, z: 0 }, end: { x: 4, z: 3 }, thickness: 0.1, height: 2.5 },
    ];
    expect(roomCorners(room(open))).toEqual([
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 3 },
    ]);
  });

  it('stops cleanly when walls are disconnected rather than looping forever', () => {
    const split: Wall[] = [
      { id: 'a', start: { x: 0, z: 0 }, end: { x: 4, z: 0 }, thickness: 0.1, height: 2.5 },
      { id: 'far', start: { x: 90, z: 90 }, end: { x: 95, z: 90 }, thickness: 0.1, height: 2.5 },
    ];
    const corners = roomCorners(room(split));
    expect(corners.length).toBeGreaterThan(0);
    expect(corners.length).toBeLessThanOrEqual(4);
  });
});
