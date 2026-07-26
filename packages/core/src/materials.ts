import type { Finish } from './schema.js';

/**
 * PBR roughness for each named paint/flooring finish — matte scatters light broadly
 * (high roughness, soft/no highlight), gloss reflects tightly (low roughness, sharp
 * highlight). Users pick a finish name; the renderer only needs the roughness number.
 */
const FINISH_ROUGHNESS: Record<Finish, number> = {
  matte: 0.95,
  eggshell: 0.7,
  satin: 0.4,
  gloss: 0.08,
};

export function finishToRoughness(finish: Finish): number {
  return FINISH_ROUGHNESS[finish];
}
