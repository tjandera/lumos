/**
 * Procedural PBR helpers that make the low-poly Kenney GLBs read as real materials
 * when Realism is on — fabric sheen on seating, wood clearcoat on tables, plaster on
 * walls, plank floors. Generated in-canvas (no downloads); base textures are cached,
 * then cloned per material so `repeat` mutations never clobber another surface.
 */

import * as THREE from "three";
import type { CatalogCategory } from "@interior/catalog";

const texCache = new Map<string, THREE.CanvasTexture>();

function canvasTex(key: string, size: number, paint: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const hit = texCache.get(key);
  if (hit) return hit;
  if (typeof document === "undefined") {
    // Headless/tests — return a 1×1 stub so imports don't explode outside a browser.
    const data = new Uint8Array([200, 180, 160, 255]);
    const tex = new THREE.DataTexture(data, 1, 1);
    tex.needsUpdate = true;
    texCache.set(key, tex as unknown as THREE.CanvasTexture);
    return texCache.get(key)!;
  }
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const data = new Uint8Array([200, 180, 160, 255]);
    const tex = new THREE.DataTexture(data, 1, 1);
    tex.needsUpdate = true;
    texCache.set(key, tex as unknown as THREE.CanvasTexture);
    return texCache.get(key)!;
  }
  paint(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  texCache.set(key, tex);
  return tex;
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

export interface RealismMaterialOpts {
  category: CatalogCategory | "wall" | "floor" | "ceiling";
  color: string;
  /** Base roughness from paint finish, if any. */
  roughness?: number;
}

/**
 * Build a MeshPhysicalMaterial tuned for the surface type. Seating gets fabric sheen,
 * wood gets clearcoat, rugs get high roughness — the low-poly Kenney meshes suddenly
 * read as “material” instead of flat plastic.
 */
export function createRealismMaterial(opts: RealismMaterialOpts): THREE.MeshPhysicalMaterial {
  const { category, color } = opts;
  const mat = new THREE.MeshPhysicalMaterial({ color });

  switch (category) {
    case "seating": {
      mat.map = mapWithRepeat(fabricTexture(color), 2.5, 2.5);
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
      mat.map = mapWithRepeat(woodTexture(color), 2, 1.2);
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
        mat.map = mapWithRepeat(carpetTexture(color), 3, 3);
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
      mat.map = mapWithRepeat(woodTexture(color), 4, 4);
      mat.roughness = opts.roughness ?? 0.55;
      mat.metalness = 0.02;
      mat.clearcoat = 0.2;
      mat.clearcoatRoughness = 0.45;
      mat.envMapIntensity = 0.85;
      break;
    }
    case "wall": {
      mat.map = mapWithRepeat(plasterTexture(color), 3, 3);
      mat.roughness = opts.roughness ?? 0.88;
      mat.metalness = 0;
      mat.envMapIntensity = 0.45;
      break;
    }
    case "ceiling": {
      mat.map = mapWithRepeat(plasterTexture(color), 2, 2);
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
export function applyRealismMaterials(root: THREE.Object3D, category: CatalogCategory, color: string): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = createRealismMaterial({ category, color });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}
