import type { Wall } from './schema';

/** Build the 4 walls of a w×d rectangular room centered at the origin. */
export function rectWalls(w: number, d: number, height: number, thickness: number): Wall[] {
  const hw = w / 2;
  const hd = d / 2;
  return [
    { id: 'wall-N', start: { x: -hw, z: -hd }, end: { x: hw, z: -hd }, thickness, height },
    { id: 'wall-S', start: { x: -hw, z: hd }, end: { x: hw, z: hd }, thickness, height },
    { id: 'wall-W', start: { x: -hw, z: -hd }, end: { x: -hw, z: hd }, thickness, height },
    { id: 'wall-E', start: { x: hw, z: -hd }, end: { x: hw, z: hd }, thickness, height },
  ];
}
