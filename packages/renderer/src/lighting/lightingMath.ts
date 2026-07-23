/**
 * Pure lighting math for the rig: sun intensity/color curves vs. elevation,
 * sky/ambient colors, world bounds of a document, and shadow-camera fitting.
 *
 * These are deliberately free of any GL / R3F / React state so they can be
 * unit-tested headlessly. `THREE.Color` / `THREE.Vector3` are used only as
 * value types (three's math runs fine in plain Node).
 */

import * as THREE from "three";
import type { SceneDocument, Vector3 } from "@interior/core";

const DEG = Math.PI / 180;

/** Peak direct-sun intensity (directional light) at the zenith, tuned for ACES + sRGB output. */
export const MAX_SUN_INTENSITY = 3.2;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Hermite smoothstep from edge0..edge1. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Directional-sun intensity from elevation (radians). Zero once the sun is a
 * few degrees below the horizon (night), a soft twilight ramp across the
 * horizon, then rising toward `MAX_SUN_INTENSITY` at the zenith. Monotonic in
 * elevation above the horizon.
 */
export function sunIntensity(elevation: number): number {
  const elevDeg = elevation / DEG;
  if (elevDeg <= -4) return 0;
  const horizonFade = smoothstep(-4, 4, elevDeg);
  const altitude = Math.max(0, Math.sin(elevation));
  return MAX_SUN_INTENSITY * horizonFade * (0.1 + 0.9 * altitude);
}

/**
 * Direct-sun color from elevation: warm orange near/below the horizon (golden
 * hour), shifting to a near-white, faintly cool daylight high in the sky.
 */
export function sunColor(elevation: number): THREE.Color {
  const warm = new THREE.Color(1.0, 0.55, 0.25);
  const cool = new THREE.Color(1.0, 0.95, 0.88);
  const t = clamp01(elevation / (25 * DEG));
  return warm.clone().lerp(cool, t);
}

export interface SkyColors {
  /** Top-of-dome color for the environment gradient. */
  zenith: THREE.Color;
  /** Horizon-band color for the environment gradient (and hemisphere sky term). */
  horizon: THREE.Color;
  /** Bottom / ground-bounce color (hemisphere ground term). */
  ground: THREE.Color;
  /** Hemisphere-light intensity (ambient fill). */
  hemiIntensity: number;
  /** Overall environment-map intensity multiplier. */
  envIntensity: number;
}

/**
 * Sky/ambient palette as a function of sun elevation: bright blue day, warm
 * golden-hour horizon, deep-navy night with a small non-zero fill so night
 * scenes are readable rather than pure black.
 */
export function skyColors(elevation: number): SkyColors {
  const elevDeg = elevation / DEG;
  const day = smoothstep(-6, 8, elevDeg);
  // Golden weight peaks while the sun sits just above the horizon.
  const golden = day * (1 - smoothstep(2, 18, elevDeg));

  const nightZenith = new THREE.Color("#05070f");
  const dayZenith = new THREE.Color("#5b8fd0");
  const zenith = nightZenith.clone().lerp(dayZenith, day);

  const nightHorizon = new THREE.Color("#0a0e1a");
  const dayHorizon = new THREE.Color("#b7d2ef");
  const horizon = nightHorizon.clone().lerp(dayHorizon, day);
  // Warm the horizon band during golden hour.
  horizon.lerp(new THREE.Color("#ff9a52"), golden * 0.6);

  const nightGround = new THREE.Color("#070808");
  const dayGround = new THREE.Color("#b9a884");
  const ground = nightGround.clone().lerp(dayGround, day);

  return {
    zenith,
    horizon,
    ground,
    hemiIntensity: 0.05 + 0.55 * day,
    envIntensity: 0.15 + 0.85 * day
  };
}

export interface Bounds3 {
  min: Vector3;
  max: Vector3;
}

/**
 * Axis-aligned world bounds of everything renderable in a document: room
 * footprints (plan-X -> world-X, plan-Y -> world-Z) up to each room's ceiling,
 * plus furniture footprints/heights. Returns `null` for an empty document.
 */
export function documentWorldBounds(document: SceneDocument): Bounds3 | null {
  let minX = Infinity;
  const minY = 0;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let seen = false;

  for (const room of document.rooms) {
    for (const p of room.walls) {
      seen = true;
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.y);
      maxZ = Math.max(maxZ, p.y);
    }
    maxY = Math.max(maxY, room.height);
  }

  for (const item of document.furniture) {
    seen = true;
    const hx = item.dimensions.w / 2;
    const hz = item.dimensions.d / 2;
    minX = Math.min(minX, item.position.x - hx);
    maxX = Math.max(maxX, item.position.x + hx);
    minZ = Math.min(minZ, item.position.z - hz);
    maxZ = Math.max(maxZ, item.position.z + hz);
    maxY = Math.max(maxY, item.dimensions.h);
  }

  if (!seen) return null;
  if (maxY < minY) maxY = 2.4;
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

export interface ShadowCameraFit {
  /** World position for the directional light. */
  position: Vector3;
  /** World point the light looks at (bounds center). */
  target: Vector3;
  near: number;
  far: number;
  /** Symmetric orthographic half-extent (used for left/right/top/bottom). */
  halfExtent: number;
}

/**
 * Fit a directional-light shadow camera tightly to world `bounds`, given the
 * unit direction toward the sun (`toSun`). The light is pulled back along
 * `toSun` just past the bounding sphere so the whole room is inside a compact
 * orthographic frustum — no wasted shadow-map resolution, minimal acne.
 */
export function fitSunShadowCamera(bounds: Bounds3, toSun: Vector3, margin = 0.5): ShadowCameraFit {
  const center: Vector3 = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2
  };
  const dx = bounds.max.x - bounds.min.x;
  const dy = bounds.max.y - bounds.min.y;
  const dz = bounds.max.z - bounds.min.z;
  const radius = 0.5 * Math.hypot(dx, dy, dz);

  const len = Math.hypot(toSun.x, toSun.y, toSun.z) || 1;
  const dir: Vector3 = { x: toSun.x / len, y: toSun.y / len, z: toSun.z / len };
  const distance = radius + margin + radius; // pull back past the sphere

  const position: Vector3 = {
    x: center.x + dir.x * distance,
    y: center.y + dir.y * distance,
    z: center.z + dir.z * distance
  };

  const near = Math.max(0.05, distance - radius - margin);
  const far = distance + radius + margin;
  const halfExtent = radius * 1.1 + margin;

  return { position, target: center, near, far, halfExtent };
}
