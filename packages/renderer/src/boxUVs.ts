/**
 * Box-projected UVs in real-world units.
 *
 * The Kenney GLBs ship UVs, but not the kind a tiling detail texture can use: they're
 * scaled planar projections spanning roughly ±15 to ±74 UV units, and the span differs
 * per model (a bed is ~74, a bookshelf ~15). Applying a wood or fabric image on top of
 * those tiles it dozens to hundreds of times across a single object — the result reads
 * as grey static rather than grain or weave, at a wildly different density on every
 * piece of furniture.
 *
 * This regenerates the `uv` attribute by projecting each vertex onto the plane its
 * normal points along, measured in metres, so texture density is a property of the
 * material rather than an accident of how a given model was authored. A 0.5 m stool leg
 * and a 2 m sofa then show the same weave at the same physical size, which is what makes
 * furniture read as real material.
 */

import * as THREE from 'three';

/**
 * Rewrite `root`'s meshes with box-projected UVs.
 *
 * @param worldScale  Uniform scale applied to this object by its parent (see
 *   FurnitureModel, which scales by `targetWidth / size.x`). Local vertex coordinates
 *   are multiplied by this so tiling is computed against real-world metres, not the
 *   arbitrary units the model happened to be authored in.
 * @param tilesPerMeter  How many times the texture repeats per metre of surface.
 *
 * Geometry is cloned before it's touched: `scene.clone(true)` shares geometry with
 * useGLTF's cache, so writing UVs in place would corrupt every other instance of the
 * model and persist across remounts.
 */
export function applyBoxUVs(root: THREE.Object3D, worldScale: number, tilesPerMeter: number): void {
  if (!Number.isFinite(worldScale) || worldScale <= 0) return;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const cloned = mesh.geometry.clone();
    if (writeBoxUVs(cloned, worldScale, tilesPerMeter)) {
      mesh.geometry = cloned;
    } else {
      cloned.dispose();
    }
  });
}

/** Returns false (leaving the geometry untouched) if it lacks what's needed to project. */
export function writeBoxUVs(geometry: THREE.BufferGeometry, worldScale: number, tilesPerMeter: number): boolean {
  const pos = geometry.getAttribute('position');
  if (!pos) return false;
  let nor = geometry.getAttribute('normal');
  if (!nor) {
    geometry.computeVertexNormals();
    nor = geometry.getAttribute('normal');
    if (!nor) return false;
  }

  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * worldScale;
    const y = pos.getY(i) * worldScale;
    const z = pos.getZ(i) * worldScale;
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));

    // Project along the dominant normal axis, so each face is textured with the two
    // coordinates that actually vary across it — projecting a wall using its own
    // normal's axis would collapse the texture into a streak.
    let u: number;
    let v: number;
    if (nx >= ny && nx >= nz) {
      u = z;
      v = y;
    } else if (ny >= nx && ny >= nz) {
      u = x;
      v = z;
    } else {
      u = x;
      v = y;
    }

    uv[i * 2] = u * tilesPerMeter;
    uv[i * 2 + 1] = v * tilesPerMeter;
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return true;
}

/**
 * Texture density per surface type, in repeats per metre. These are physical choices:
 * floorboards are about a metre long, a fabric weave repeats every few centimetres, so
 * they differ by an order of magnitude rather than being one shared constant.
 */
export const TILES_PER_METER: Record<string, number> = {
  seating: 3.2, // fabric weave — fine
  tables: 0.8, // wood grain along a plank
  storage: 0.8,
  beds: 1.6, // mixed frame + textile, split the difference
  lighting: 1.2,
  decor: 2.4, // rug pile
  floor: 0.55, // floorboards ~1.8m
  wall: 1.1, // plaster stipple
  ceiling: 1.1,
};

/** Repeats-per-metre for a category, with a sane fallback for anything unmapped. */
export function tilesPerMeterFor(category: string): number {
  return TILES_PER_METER[category] ?? 1.5;
}
