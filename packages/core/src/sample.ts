import type { SceneDocument } from './schema';

/** Build the 4 walls of a w×d room centered at the origin. */
function rectWalls(w: number, d: number, height: number, thickness: number) {
  const hw = w / 2;
  const hd = d / 2;
  return [
    { id: 'wall-N', start: { x: -hw, z: -hd }, end: { x: hw, z: -hd }, thickness, height },
    { id: 'wall-S', start: { x: -hw, z: hd }, end: { x: hw, z: hd }, thickness, height },
    { id: 'wall-W', start: { x: -hw, z: -hd }, end: { x: -hw, z: hd }, thickness, height },
    { id: 'wall-E', start: { x: hw, z: -hd }, end: { x: hw, z: hd }, thickness, height },
  ];
}

/** A simple 5m × 4m room with a couple of furniture placeholders and a lamp. */
export const sampleScene: SceneDocument = {
  schemaVersion: 2,
  id: 'sample-studio',
  name: 'Sample Studio',
  site: { lat: 1.2966, lng: 103.8764, trueNorthOffsetDeg: 0 },
  rooms: [
    {
      id: 'room-1',
      name: 'Living Room',
      walls: rectWalls(5, 4, 2.7, 0.12),
    },
  ],
  openings: [
    { id: 'win-1', wallId: 'wall-S', kind: 'window', offset: 1.7, width: 1.6, height: 1.2, sillHeight: 0.9 },
    { id: 'door-1', wallId: 'wall-W', kind: 'door', offset: 0.4, width: 0.9, height: 2.1, sillHeight: 0 },
  ],
  furniture: [
    { id: 'f-sofa', catalogId: 'sofa-2seat', position: { x: 0, y: 0, z: -1.3 }, rotationY: 0, scale: 1 },
    { id: 'f-table', catalogId: 'coffee-table', position: { x: 0, y: 0, z: -0.2 }, rotationY: 0, scale: 1 },
  ],
  lights: [
    { id: 'lamp-1', kind: 'lamp', position: { x: 1.6, y: 1.4, z: -1.6 }, intensityCandela: 200, color: '#ffe6b0' },
  ],
  view: {
    timeOfDay: '2026-06-21T16:00:00',
    camera: { position: { x: 5.5, y: 4.5, z: 5.5 }, target: { x: 0, y: 1, z: 0 } },
  },
};
