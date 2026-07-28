import { DEFAULT_WALL_MATERIAL, DEFAULT_FLOOR_MATERIAL, DEFAULT_CEILING_MATERIAL, type SceneDocument } from './schema.js';
import { rectWalls } from './geometry.js';
import { FIXTURE_MOUNT_HEIGHT } from './fixtures.js';
import { kelvinToRgb } from './color.js';

/**
 * "Marina Studio" — a furnished 5m × 4m showcase room (rectWalls(5, 4), centered at the
 * origin: x ∈ [-2.5, 2.5], z ∈ [-2, 2]) meant to look good the moment the app opens.
 * Every furniture footprint below is hand-placed to avoid AABB overlaps (see
 * `collision.test.ts`-style reasoning) — the rug is the one deliberate exception, since
 * rugs sit *under* other pieces and are excluded from collision checks in the UI.
 */
export const sampleScene: SceneDocument = {
  schemaVersion: 6,
  meta: {
    id: 'marina-studio',
    name: 'Marina Studio',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
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
      offset: 1.2,
      width: 2.6,
      height: 1.4,
      sillHeight: 0.75,
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
    { id: 'f-sofa', catalogId: 'sofa-2seat', position: { x: -0.15, y: 0, z: -1.35 }, rotationY: 0, scale: 1 },
    { id: 'f-table', catalogId: 'coffee-table', position: { x: -0.1, y: 0, z: -0.2 }, rotationY: 0, scale: 1 },
    { id: 'f-chair', catalogId: 'armchair', position: { x: 1.35, y: 0, z: -0.15 }, rotationY: -40, scale: 1 },
    { id: 'f-side', catalogId: 'side-table', position: { x: -1.4, y: 0, z: -1.35 }, rotationY: 0, scale: 1 },
    { id: 'f-lamp', catalogId: 'floor-lamp', position: { x: 1.8, y: 0, z: -1.4 }, rotationY: 20, scale: 1 },
    { id: 'f-shelf', catalogId: 'bookshelf', position: { x: 2.15, y: 0, z: 1.2 }, rotationY: -90, scale: 1 },
    { id: 'f-plant', catalogId: 'plant', position: { x: -1.95, y: 0, z: 1.35 }, rotationY: 15, scale: 1 },
    { id: 'f-rug', catalogId: 'rug', position: { x: 0, y: 0, z: -0.3 }, rotationY: 0, scale: 1 },
  ],
  lights: [
    {
      id: 'light-floor-lamp',
      kind: 'floor',
      position: { x: 1.8, y: FIXTURE_MOUNT_HEIGHT.floor, z: -1.4 },
      intensityCandela: 220,
      color: kelvinToRgb(2700),
      kelvin: 2700,
      on: true,
      castShadow: true,
      auto: true,
      furnitureItemId: 'f-lamp',
    },
    {
      id: 'light-ceiling',
      kind: 'ceiling',
      position: { x: 0.2, y: FIXTURE_MOUNT_HEIGHT.ceiling, z: 0.3 },
      intensityCandela: 350,
      color: kelvinToRgb(3000),
      kelvin: 3000,
      on: true,
      castShadow: true,
      auto: true,
    },
  ],
  lightingScenes: [],
  view: {
    timeOfDay: '2026-06-21T16:00:00',
    camera: { position: { x: 5.5, y: 4.5, z: 5.5 }, target: { x: 0, y: 1, z: 0 } },
  },
};
