/**
 * Photographic CC0 PBR maps (colour + normal + roughness) for furniture and room
 * surfaces, replacing the canvas-drawn approximations when they're available.
 *
 * The procedural maps in realismMaterials.ts stay as the fallback, and that matters:
 * they're the only thing that works headless (tests, SSR) and while the real images are
 * still downloading, so a material is never missing entirely.
 *
 * Sources are all CC0 from ambientCG — see LICENSES.md. Files live in
 * apps/web/public/textures and are served from `/textures/...`, matching how the
 * Kenney GLBs are served from `/models/...`.
 */

import * as THREE from 'three';
import type { MaterialFamily } from '@interior/core';

// The vocabulary lives in the document schema (a user's material choice has to be
// saved and shared), so it's imported rather than redeclared here — the renderer only
// owns the mapping from a family to its texture files.
export type { MaterialFamily } from '@interior/core';

export const MATERIAL_FAMILIES: MaterialFamily[] = [
  'wood-oak',
  'wood-walnut',
  'wood-floor',
  'fabric-wool',
  'fabric-linen',
  'leather',
  'carpet',
  'plaster',
  'marble',
  'metal',
];

/** Human labels for the material picker. */
export const FAMILY_LABEL: Record<MaterialFamily, string> = {
  'wood-oak': 'Oak',
  'wood-walnut': 'Walnut',
  'wood-floor': 'Floorboards',
  'fabric-wool': 'Wool',
  'fabric-linen': 'Linen',
  leather: 'Leather',
  carpet: 'Carpet',
  plaster: 'Plaster',
  marble: 'Marble',
  metal: 'Metal',
};

/** What each catalog category is made of by default, before any per-item override. */
export const FAMILY_FOR_CATEGORY: Record<string, MaterialFamily> = {
  seating: 'fabric-wool',
  tables: 'wood-oak',
  storage: 'wood-walnut',
  beds: 'fabric-linen',
  lighting: 'metal',
  decor: 'carpet',
  floor: 'wood-floor',
  wall: 'plaster',
  ceiling: 'plaster',
};

export function familyForCategory(category: string): MaterialFamily {
  return FAMILY_FOR_CATEGORY[category] ?? 'wood-oak';
}

export interface FamilyMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

const cache = new Map<MaterialFamily, FamilyMaps | null>();
let loader: THREE.TextureLoader | null = null;

/**
 * Load (and cache) the three maps for a family, or null when images can't be loaded at
 * all — headless runs have no Image, and callers fall back to the procedural maps.
 *
 * TextureLoader returns a Texture immediately and fills in its image asynchronously, so
 * callers get a usable material now and the photo appears a frame or two later.
 */
export function familyMaps(family: MaterialFamily): FamilyMaps | null {
  if (cache.has(family)) return cache.get(family)!;
  if (typeof document === 'undefined') {
    cache.set(family, null);
    return null;
  }
  try {
    loader ??= new THREE.TextureLoader();
    const base = `/textures/${family}`;
    const color = loader.load(`${base}_color.jpg`);
    const normal = loader.load(`${base}_normal.jpg`);
    const rough = loader.load(`${base}_rough.jpg`);

    // Colour is sRGB; normal and roughness are data and must stay linear or lighting
    // reads them through a gamma curve and comes out subtly wrong.
    color.colorSpace = THREE.SRGBColorSpace;
    normal.colorSpace = THREE.NoColorSpace;
    rough.colorSpace = THREE.NoColorSpace;
    for (const t of [color, normal, rough]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
    }

    const maps: FamilyMaps = { map: color, normalMap: normal, roughnessMap: rough };
    cache.set(family, maps);
    return maps;
  } catch (err) {
    console.warn('[textures] failed to load family', family, err);
    cache.set(family, null);
    return null;
  }
}

/** Per-surface clone of a family's maps at a given UV repeat. The cached originals are
 *  never mutated, so two surfaces can tile the same material differently. */
export function familyMapsWithRepeat(family: MaterialFamily, rx: number, ry: number): FamilyMaps | null {
  const base = familyMaps(family);
  if (!base) return null;
  const clone = (t: THREE.Texture) => {
    const c = t.clone();
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(rx, ry);
    c.needsUpdate = true;
    return c;
  };
  return { map: clone(base.map), normalMap: clone(base.normalMap), roughnessMap: clone(base.roughnessMap) };
}
