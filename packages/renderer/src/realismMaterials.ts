/**
 * Procedural PBR helpers that make the low-poly Kenney GLBs read as real materials
 * when Realism is on — fabric sheen on seating, wood clearcoat on tables, plaster on
 * walls, plank floors. Generated in-canvas (no downloads); base textures are cached,
 * then cloned per material so `repeat` mutations never clobber another surface.
 */

import * as THREE from "three";
import type { CatalogCategory } from "@interior/catalog";
import { familyForCategory, familyMapsWithRepeat, type MaterialFamily } from "./pbrTextures.js";

const texCache = new Map<string, THREE.CanvasTexture>();

function stubTexture(key: string): THREE.CanvasTexture {
  // Headless/tests — return a 1×1 stub so imports don't explode outside a browser.
  const data = new Uint8Array([200, 180, 160, 255]);
  const tex = new THREE.DataTexture(data, 1, 1);
  tex.needsUpdate = true;
  texCache.set(key, tex as unknown as THREE.CanvasTexture);
  return texCache.get(key)!;
}

function canvasTex(key: string, size: number, paint: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const hit = texCache.get(key);
  if (hit) return hit;
  if (typeof document === "undefined") return stubTexture(key);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return stubTexture(key);
  paint(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  texCache.set(key, tex);
  return tex;
}

/**
 * Builds a tangent-space normal map from a per-pixel height function, via central-
 * difference gradients (wrapping at the edges so it tiles cleanly under RepeatWrapping,
 * matching the base color map it sits alongside). `heightAt` must be pure/deterministic
 * in (x, y) — it gets resampled at each pixel's neighbours to estimate the gradient.
 */
function heightNormalTex(key: string, size: number, heightAt: (x: number, y: number) => number, strength: number): THREE.CanvasTexture {
  const cacheKey = `normal:${key}`;
  const hit = texCache.get(cacheKey);
  if (hit) return hit;
  if (typeof document === "undefined") return stubTexture(cacheKey);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return stubTexture(cacheKey);

  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) h[y * size + x] = heightAt(x, y);
  }
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)]!;

  const img = ctx.createImageData(size, size);
  const n = new THREE.Vector3();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      n.set(-dx, -dy, 1).normalize();
      const idx = (y * size + x) * 4;
      img.data[idx] = Math.round((n.x * 0.5 + 0.5) * 255);
      img.data[idx + 1] = Math.round((n.y * 0.5 + 0.5) * 255);
      img.data[idx + 2] = Math.round((n.z * 0.5 + 0.5) * 255);
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace; // normal maps are data, not color — must stay linear
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  texCache.set(cacheKey, tex);
  return tex;
}

/** Deterministic pseudo-random hash in [0, 1) — a GLSL-noise staple, used where a
 *  height function needs per-pixel variation without touching `Math.random()` (which
 *  would break on resample at neighbouring pixels for the gradient above). */
function hash01(x: number, y: number): number {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** Clone a cached map and set its UV repeat — never mutate the shared cache entry. */
function mapWithRepeat(base: THREE.Texture, rx: number, ry: number): THREE.Texture {
  const map = base.clone();
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(rx, ry);
  map.needsUpdate = true;
  return map;
}

/** Soft woven-fabric noise for sofas / chairs. */
export function fabricTexture(tint: string): THREE.CanvasTexture {
  return canvasTex(`fabric:${tint}`, 256, (ctx, size) => {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        const n = (Math.sin(x * 0.37) * Math.cos(y * 0.29) + 1) * 0.5;
        const v = Math.floor(180 + n * 50 + ((x * 17 + y * 31) % 20));
        ctx.fillStyle = `rgba(${v},${v - 8},${v - 14},${0.18 + n * 0.2})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }
  });
}

/** Horizontal wood-plank pattern for tables / floors. */
export function woodTexture(tint: string): THREE.CanvasTexture {
  return canvasTex(`wood:${tint}`, 512, (ctx, size) => {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, size, size);
    const plank = 42;
    for (let y = 0; y < size; y += plank) {
      const shade = 0.88 + ((y / plank) % 3) * 0.04;
      ctx.fillStyle = `rgba(0,0,0,${0.08 + ((y / plank) % 2) * 0.05})`;
      ctx.fillRect(0, y, size, plank - 2);
      ctx.strokeStyle = `rgba(40,25,10,${0.25 * shade})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, y + plank - 1);
      ctx.lineTo(size, y + plank - 1);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const x0 = (i * 73 + y * 13) % size;
        ctx.strokeStyle = `rgba(60,35,15,${0.12 + (i % 3) * 0.04})`;
        ctx.beginPath();
        ctx.moveTo(x0, y + 4);
        ctx.bezierCurveTo(x0 + 40, y + plank * 0.4, x0 - 20, y + plank * 0.7, x0 + 30, y + plank - 4);
        ctx.stroke();
      }
    }
  });
}

/** Fine plaster / paint noise for walls. */
export function plasterTexture(tint: string): THREE.CanvasTexture {
  return canvasTex(`plaster:${tint}`, 256, (ctx, size) => {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const a = 0.03 + Math.random() * 0.06;
      ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  });
}

/** Soft rug / carpet fibers. */
export function carpetTexture(tint: string): THREE.CanvasTexture {
  return canvasTex(`carpet:${tint}`, 256, (ctx, size) => {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 6000; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.strokeStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.08})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 4, y + 2 + Math.random() * 3);
      ctx.stroke();
    }
  });
}

/** Woven-weave bump matching `fabricTexture`'s noise, so light raking across a sofa
 *  cushion catches the same pattern the color map implies instead of looking flat. */
export function fabricNormalMap(): THREE.CanvasTexture {
  return heightNormalTex("fabric", 256, (x, y) => (Math.sin(x * 0.37) * Math.cos(y * 0.29) + 1) * 0.5, 1.4);
}

/** Plank grooves + long grain direction matching `woodTexture`'s plank rows. */
export function woodNormalMap(): THREE.CanvasTexture {
  const plank = 42;
  return heightNormalTex(
    "wood",
    512,
    (x, y) => {
      const withinPlank = ((y % plank) + plank) % plank;
      const groove = withinPlank > plank - 3 ? -1 : 0;
      const grain = Math.sin(x * 0.08 + y * 0.5) * 0.15;
      return groove + grain;
    },
    2.2,
  );
}

/** Fine stipple bump matching `plasterTexture`'s speckle density. */
export function plasterNormalMap(): THREE.CanvasTexture {
  return heightNormalTex("plaster", 256, (x, y) => hash01(x, y), 0.6);
}

/** Short fiber-direction bump matching `carpetTexture`'s stroke pattern. */
export function carpetNormalMap(): THREE.CanvasTexture {
  return heightNormalTex("carpet", 256, (x, y) => hash01(x * 1.7, y * 2.3), 1.1);
}

export interface RealismMaterialOpts {
  category: CatalogCategory | "wall" | "floor" | "ceiling";
  color: string;
  /** Base roughness from paint finish, if any. */
  roughness?: number;
  /**
   * Set when the mesh has been given box-projected UVs (see boxUVs.ts), which already
   * encode tiling in repeats-per-metre. The per-material `repeat` below then has to be
   * 1, or the two multiply and the texture tiles far too finely to read as a material.
   * Room surfaces (wall/floor/ceiling) keep their own UVs and so leave this off.
   */
  boxUV?: boolean;
  /**
   * Which photographic CC0 material to use (see pbrTextures.ts). Defaults to the
   * category's usual material; set it to let a user say "this sofa is leather, not
   * wool". Falls back to the procedural maps when the images can't be loaded.
   */
  family?: MaterialFamily;
}

/**
 * How far a photographic albedo is pulled toward white before the catalog colour
 * multiplies it. At 0 the item's colour would double-darken a already-toned photo; at 1
 * the whole catalog would look identical. This keeps the photo's own tone dominant while
 * a walnut shelf and an oak shelf still read as different pieces.
 */
const PHOTO_TINT_TOWARD_WHITE = 0.6;

/**
 * Assign colour/normal/roughness maps, preferring the photographic set and falling back
 * to the canvas-drawn ones (headless runs, or images that failed to load).
 */
function assignMaps(
  mat: THREE.MeshPhysicalMaterial,
  family: MaterialFamily,
  color: string,
  repeat: [number, number],
  procedural: { color: () => THREE.Texture; normal: () => THREE.Texture },
  normalScale: number,
): void {
  const photo = familyMapsWithRepeat(family, repeat[0], repeat[1]);
  if (photo) {
    mat.map = photo.map;
    mat.normalMap = photo.normalMap;
    mat.roughnessMap = photo.roughnessMap;
    mat.color = new THREE.Color(color).lerp(new THREE.Color("#ffffff"), PHOTO_TINT_TOWARD_WHITE);
  } else {
    mat.map = mapWithRepeat(procedural.color(), repeat[0], repeat[1]);
    mat.normalMap = mapWithRepeat(procedural.normal(), repeat[0], repeat[1]);
  }
  mat.normalScale = new THREE.Vector2(normalScale, normalScale);
}

/**
 * Build a MeshPhysicalMaterial tuned for the surface type. Seating gets fabric sheen,
 * wood gets clearcoat, rugs get high roughness — the low-poly Kenney meshes suddenly
 * read as “material” instead of flat plastic.
 */
export function createRealismMaterial(opts: RealismMaterialOpts): THREE.MeshPhysicalMaterial {
  const { category, color } = opts;
  const mat = new THREE.MeshPhysicalMaterial({ color });
  /** UV repeat for this material — neutral when box UVs already carry the tiling. */
  const rep = (rx: number, ry: number): [number, number] => (opts.boxUV ? [1, 1] : [rx, ry]);
  const family = opts.family ?? familyForCategory(category);

  switch (category) {
    case "seating": {
      assignMaps(mat, family, color, rep(2.5, 2.5),
        { color: () => fabricTexture(color), normal: () => fabricNormalMap() }, 0.45);
      mat.roughness = 0.78;
      mat.metalness = 0;
      mat.sheen = 1;
      mat.sheenRoughness = 0.55;
      mat.sheenColor = new THREE.Color(color).offsetHSL(0, 0.05, 0.08);
      mat.envMapIntensity = 0.55;
      break;
    }
    case "tables":
    case "storage":
    case "beds": {
      assignMaps(mat, family, color, rep(2, 1.2),
        { color: () => woodTexture(color), normal: () => woodNormalMap() }, 0.6);
      mat.roughness = opts.roughness ?? 0.42;
      mat.metalness = 0.02;
      mat.clearcoat = 0.35;
      mat.clearcoatRoughness = 0.3;
      mat.envMapIntensity = 0.9;
      break;
    }
    case "decor": {
      const c = new THREE.Color(color);
      const isPlant = c.g > c.r * 1.05 && c.g > c.b;
      if (isPlant) {
        mat.color = c;
        mat.roughness = 0.65;
        mat.metalness = 0;
        mat.sheen = 0.4;
        mat.sheenColor = new THREE.Color("#7dcf8a");
        mat.envMapIntensity = 0.5;
      } else {
        assignMaps(mat, family, color, rep(3, 3),
          { color: () => carpetTexture(color), normal: () => carpetNormalMap() }, 0.5);
        mat.roughness = 0.92;
        mat.metalness = 0;
        mat.envMapIntensity = 0.35;
      }
      break;
    }
    case "lighting": {
      mat.color = new THREE.Color(color);
      mat.roughness = 0.35;
      mat.metalness = 0.45;
      mat.envMapIntensity = 1.2;
      break;
    }
    case "floor": {
      assignMaps(mat, family, color, [4, 4],
        { color: () => woodTexture(color), normal: () => woodNormalMap() }, 0.55);
      mat.roughness = opts.roughness ?? 0.55;
      mat.metalness = 0.02;
      mat.clearcoat = 0.2;
      mat.clearcoatRoughness = 0.45;
      mat.envMapIntensity = 0.85;
      break;
    }
    case "wall": {
      assignMaps(mat, family, color, [3, 3],
        { color: () => plasterTexture(color), normal: () => plasterNormalMap() }, 0.3);
      mat.roughness = opts.roughness ?? 0.88;
      mat.metalness = 0;
      mat.envMapIntensity = 0.45;
      break;
    }
    case "ceiling": {
      assignMaps(mat, family, color, [2, 2],
        { color: () => plasterTexture(color), normal: () => plasterNormalMap() }, 0.22);
      mat.roughness = opts.roughness ?? 0.92;
      mat.metalness = 0;
      mat.envMapIntensity = 0.3;
      break;
    }
    default:
      mat.roughness = 0.7;
      mat.envMapIntensity = 0.6;
  }

  mat.needsUpdate = true;
  return mat;
}

/**
 * Replace every mesh material under `root` with a realism material for `category`.
 * Does NOT dispose the previous materials — Kenney GLBs from `useGLTF` share a cached
 * material graph; disposing them would break every other instance / remount.
 */
/**
 * True when a mesh already carries maps authored for that specific model.
 *
 * The Kenney models ship flat untextured materials, so synthesising one is a clear
 * upgrade. The Poly Haven models ship a full authored PBR set fitted to their own UV
 * layout — overwriting that with a generic tiling material would replace better data
 * with worse, and would smear, because their UVs are a bespoke unwrap rather than the
 * box projection our generic path assumes.
 */
export function hasAuthoredMaps(material: THREE.Material | THREE.Material[]): boolean {
  const list = Array.isArray(material) ? material : [material];
  return list.some((m) => {
    const std = m as THREE.MeshStandardMaterial;
    return Boolean(std && (std.map || std.normalMap || std.roughnessMap));
  });
}

/**
 * Give every mesh under `root` a realism material — unless the model already has its
 * own authored maps, in which case only shadow flags are set and the authored look is
 * left intact. `family` (a user's explicit "this is leather") still overrides, because
 * that's a deliberate choice rather than a default.
 */
export function applyRealismMaterials(
  root: THREE.Object3D,
  category: CatalogCategory,
  color: string,
  family?: MaterialFamily,
): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Respect a model's own textures unless the user explicitly picked a material.
    if (!family && mesh.material && hasAuthoredMaps(mesh.material)) return;
    // Otherwise: synthesised material. Furniture meshes get box-projected UVs (see
    // boxUVs.ts / FurnitureModel), so this must not apply a second repeat on top.
    mesh.material = createRealismMaterial({ category, color, boxUV: true, family });
  });
}
