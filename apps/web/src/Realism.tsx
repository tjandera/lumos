import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, N8AO } from '@react-three/postprocessing';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useUiStore, type Quality } from './uiStore';

/**
 * Approximate ambient/bounce lighting + reflections without downloading an HDRI: bakes
 * three.js's built-in RoomEnvironment (a small procedural scene of soft area lights)
 * into a PMREM-processed cubemap and sets it as the scene's environment. This is the
 * standard real-time approximation for one-bounce/image-based GI — full offline
 * path-traced multi-bounce GI is future work (see LIGHTING_ROADMAP.md).
 */
export function SceneEnvironment({ intensity = 1 }: { intensity?: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envScene = new RoomEnvironment();
    const target = pmrem.fromScene(envScene, 0.04);
    scene.environment = target.texture;
    return () => {
      scene.environment = null;
      target.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  // Separate from mounting: the environment is always present (so material finish is
  // visible as a reflection change), but how much *ambient light* it contributes is
  // dialled down outside Realism mode, to keep the sun/lux studies looking as tuned.
  useEffect(() => {
    scene.environmentIntensity = intensity;
    return () => {
      scene.environmentIntensity = 1;
    };
  }, [scene, intensity]);

  return null;
}

const AO_SAMPLES: Record<Quality, number> = { low: 5, med: 8, high: 12 };

/** Ambient occlusion (contact shadows) + a tasteful bloom on genuinely bright pixels
 * (the sun disc, lit fixtures) — not full path tracing, but a real quality lift. */
export function RealismEffects({ quality }: { quality: Quality }) {
  // @react-three/postprocessing's EffectComposer has a mount-time race (its internal
  // pass-registration effect can run before N8AO/Bloom finish attaching to the R3F
  // scene graph) that's much likelier to lose on a cold first mount at a high AO
  // sample count than on a warm remount — shader compilation isn't cached yet. Always
  // cold-start the very first mount at the safe default, then move to the real
  // quality once mounted, which only ever triggers a (safe, already-observed-working)
  // warm remount via the key below.
  const [safeQuality, setSafeQuality] = useState<Quality>('med');
  useEffect(() => setSafeQuality(quality), [quality]);
  return (
    <EffectComposer key={safeQuality} enableNormalPass>
      <N8AO aoRadius={0.5} intensity={3} aoSamples={AO_SAMPLES[safeQuality]} distanceFalloff={1} />
      <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.3} intensity={0.35} mipmapBlur />
    </EffectComposer>
  );
}

/**
 * One-shot high-quality capture: temporarily maxes shadow/AO quality and render
 * resolution, waits a few frames for shadow maps to regenerate at the new size, then
 * grabs the canvas as a PNG. Deliberately NOT offline path-traced global illumination
 * (see LIGHTING_ROADMAP.md) — an honest "best the real-time renderer can do" snapshot.
 */
export function PhotoCapture({ active }: { active: boolean }) {
  const gl = useThree((s) => s.gl);
  const capturing = useRef(false);
  const framesWaited = useRef(0);
  const prevQuality = useRef<Quality>('med');
  const prevPixelRatio = useRef(1);
  const prevRealism = useRef(false);

  // Switching away from the 3D view pauses the frameloop, which would otherwise strand
  // an in-flight capture in "Rendering…" forever (useFrame below never ticks again).
  // Abort cleanly and restore whatever settings the capture had temporarily bumped.
  useEffect(() => {
    if (!active && capturing.current) {
      gl.setPixelRatio(prevPixelRatio.current);
      const s = useUiStore.getState();
      s.setQuality(prevQuality.current);
      if (s.enhancedRealism !== prevRealism.current) s.toggleEnhancedRealism();
      useUiStore.setState({ photoRequested: false, photoBusy: false });
      capturing.current = false;
    }
  }, [active, gl]);

  useFrame(() => {
    const { photoRequested } = useUiStore.getState();

    if (photoRequested && !capturing.current) {
      capturing.current = true;
      framesWaited.current = 0;
      const s = useUiStore.getState();
      prevQuality.current = s.quality;
      prevPixelRatio.current = gl.getPixelRatio();
      prevRealism.current = s.enhancedRealism;
      s.setQuality('high');
      if (!s.enhancedRealism) s.toggleEnhancedRealism();
      gl.setPixelRatio(Math.min(3, (window.devicePixelRatio || 1) * 1.5));
      return;
    }

    if (capturing.current) {
      framesWaited.current += 1;
      // Give shadow maps + AO a few frames to regenerate at the bumped-up settings.
      if (framesWaited.current >= 8) {
        const dataUrl = gl.domElement.toDataURL('image/png');
        gl.setPixelRatio(prevPixelRatio.current);
        const s = useUiStore.getState();
        s.setQuality(prevQuality.current);
        if (s.enhancedRealism !== prevRealism.current) s.toggleEnhancedRealism();
        s.finishPhoto(dataUrl);
        capturing.current = false;
      }
    }
  });

  return null;
}
