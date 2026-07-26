/**
 * Procedural sky environment. Builds a vertical zenith->horizon->ground
 * gradient as a small equirectangular float texture and runs it through
 * `PMREMGenerator` to produce a prefiltered environment map for image-based
 * ambient lighting. No runtime HDR/CDN fetches — everything is generated on
 * the GPU from the `SkyColors` palette.
 */

import * as THREE from "three";
import type { SkyColors } from "./lightingMath.js";

/**
 * Generate a PMREM environment texture from a sky palette. The caller owns the
 * returned texture and must dispose it when replacing/unmounting.
 */
export function createSkyEnvironment(gl: THREE.WebGLRenderer, colors: SkyColors): THREE.Texture {
  const width = 8;
  const height = 128;
  const data = new Float32Array(width * height * 4);

  const ground = colors.ground;
  const horizon = colors.horizon;
  const zenith = colors.zenith;
  const tmp = new THREE.Color();

  for (let y = 0; y < height; y++) {
    // v = 0 at the bottom row (ground), 1 at the top (zenith).
    const v = y / (height - 1);
    if (v < 0.5) {
      tmp.copy(ground).lerp(horizon, v / 0.5);
    } else {
      tmp.copy(horizon).lerp(zenith, (v - 0.5) / 0.5);
    }
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = tmp.r;
      data[i + 1] = tmp.g;
      data[i + 2] = tmp.b;
      data[i + 3] = 1;
    }
  }

  const source = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  source.colorSpace = THREE.LinearSRGBColorSpace;
  source.mapping = THREE.EquirectangularReflectionMapping;
  source.magFilter = THREE.LinearFilter;
  source.minFilter = THREE.LinearFilter;
  source.needsUpdate = true;

  const pmrem = new THREE.PMREMGenerator(gl);
  pmrem.compileEquirectangularShader();
  const env = pmrem.fromEquirectangular(source).texture;

  source.dispose();
  pmrem.dispose();
  return env;
}
