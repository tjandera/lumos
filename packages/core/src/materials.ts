import type { Finish } from './schema';

/**
 * PBR roughness for each named paint/flooring finish — matte scatters light broadly
 * (high roughness, soft/no highlight), gloss reflects tightly (low roughness, sharp
 * highlight). Users pick a finish name; the renderer only needs the roughness number.
 */
const FINISH_ROUGHNESS: Record<Finish, number> = {
  matte: 0.9,
  eggshell: 0.7,
  satin: 0.45,
  gloss: 0.15,
};

export function finishToRoughness(finish: Finish): number {
  return FINISH_ROUGHNESS[finish];
}
