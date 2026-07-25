import { DEFAULT_WALL_MATERIAL, DEFAULT_FLOOR_MATERIAL, DEFAULT_CEILING_MATERIAL, type SceneDocument } from './schema';
import { rectWalls } from './geometry';

/**
 * A simple 5m × 4m room with a couple of furniture placeholders. No lights are
 * pre-placed — fixtures are something the user adds deliberately (Lighting panel's
 * + Ceiling/Wall/Floor/Table buttons), not a default that's always sitting there.
 */
export const sampleScene: SceneDocument = {
  schemaVersion: 5,
  id: 'sample-studio',
  name: 'Sample Studio',
  site: { lat: 1.2966, lng: 103.8764, trueNorthOffsetDeg: 0 },
  rooms: [
    {
      id: 'room-1',
      name: 'Living Room',
      walls: rectWalls(5, 4, 2.7, 0.12),
      materials: { wall: DEFAULT_WALL_MATERIAL, floor: DEFAULT_FLOOR_MATERIAL, ceiling: DEFAULT_CEILING_MATERIAL },
    },
  ],
  openings: [
    {
      id: 'win-1',
      wallId: 'wall-S',
      kind: 'window',
      offset: 1.7,
      width: 1.6,
      height: 1.2,
      sillHeight: 0.9,
      glassTint: 0.06,
      covering: { type: 'curtains', state: 'open' },
    },
    {
      id: 'door-1',
      wallId: 'wall-W',
      kind: 'door',
      offset: 0.4,
      width: 0.9,
      height: 2.1,
      sillHeight: 0,
      glassTint: 0.06,
      covering: { type: 'none', state: 'open' },
    },
  ],
  furniture: [
    { id: 'f-sofa', catalogId: 'sofa-2seat', position: { x: 0, y: 0, z: -1.3 }, rotationY: 0, scale: 1 },
    { id: 'f-table', catalogId: 'coffee-table', position: { x: 0, y: 0, z: -0.2 }, rotationY: 0, scale: 1 },
  ],
  lights: [],
  lightingScenes: [],
  view: {
    timeOfDay: '2026-06-21T16:00:00',
    camera: { position: { x: 5.5, y: 4.5, z: 5.5 }, target: { x: 0, y: 1, z: 0 } },
  },
};
