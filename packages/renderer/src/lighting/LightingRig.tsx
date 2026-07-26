/**
 * Physically-sensible lighting rig for a scene document. Replaces the app's
 * ad-hoc ambient + directional lights with:
 *   - a sun `DirectionalLight` driven by `sunDirection` (elevation-aware color
 *     and intensity; shadow camera fitted to the room bounds; PCFSoft shadows
 *     with normal-offset bias tuned against acne on thin walls),
 *   - a `HemisphereLight` + a procedural PMREM sky environment for ambient/IBL,
 *   - a shadow-casting `PointLight` + emissive glow per on-state lamp,
 *   - quality presets (low/medium/high) and an optional N8AO pass on high.
 *
 * All heavy math lives in the pure, unit-tested `./lightingMath` helpers; this
 * file is the thin R3F/GL binding.
 */

import type {} from "@react-three/fiber";
import { useThree } from "@react-three/fiber";
import { EffectComposer, N8AO, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { LampLightConfig, SceneDocument } from "@interior/core";
import { createSunLight, getLampLights, getSunLight, sunDirection } from "@interior/core";
import { createSkyEnvironment } from "./environment.js";
import {
  documentWorldBounds,
  fitSunShadowCamera,
  skyColors,
  sunColor,
  sunIntensity,
  type Bounds3
} from "./lightingMath.js";
import { qualitySettings, type QualityLevel } from "./presets.js";

// Shadow bias values tuned for ~0.15 m walls: a small negative constant bias
// plus a normal-offset bias push the comparison off the surface to kill acne
// without introducing visible peter-panning.
const SHADOW_BIAS = -0.0005;
const SHADOW_NORMAL_BIAS = 0.035;

/** Fallback bounds so the rig still lights an empty scene sensibly. */
const DEFAULT_BOUNDS: Bounds3 = { min: { x: -3, y: 0, z: -3 }, max: { x: 3, y: 2.6, z: 3 } };

export interface LightingRigProps {
  document: SceneDocument;
  quality?: QualityLevel;
}

/** Configure renderer color/tone-mapping once (ACES + sRGB, physical lights). */
function useRendererSetup(): void {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.0;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    // three >= r165 removed `useLegacyLights` (physical lighting is the only
    // mode); guard so older r3f builds still opt out of legacy scaling.
    const anyGl = gl as unknown as { useLegacyLights?: boolean };
    if ("useLegacyLights" in anyGl) anyGl.useLegacyLights = false;
  }, [gl]);
}

/** Procedural PMREM sky environment, rebuilt only when the sun elevation moves. */
function useSkyEnvironment(elevation: number): void {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  // Quantize to whole degrees so slider drags don't rebuild the PMREM per frame.
  const elevKey = Math.round((elevation * 180) / Math.PI);

  useEffect(() => {
    const colors = skyColors((elevKey * Math.PI) / 180);
    const env = createSkyEnvironment(gl, colors);
    const prevEnv = scene.environment;
    const prevBg = scene.background;
    const bg = colors.zenith.clone();
    scene.environment = env;
    scene.background = bg;
    const anyScene = scene as unknown as { environmentIntensity?: number };
    if ("environmentIntensity" in anyScene) anyScene.environmentIntensity = colors.envIntensity;

    return () => {
      if (scene.environment === env) scene.environment = prevEnv;
      if (scene.background === bg) scene.background = prevBg;
      env.dispose();
    };
  }, [gl, scene, elevKey]);
}

interface SunLightProps {
  toSun: { x: number; y: number; z: number };
  elevation: number;
  bounds: Bounds3;
  castShadow: boolean;
  shadowMapSize: number;
}

function SunLight({ toSun, elevation, bounds, castShadow, shadowMapSize }: SunLightProps): JSX.Element | null {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);

  const fit = useMemo(() => fitSunShadowCamera(bounds, toSun), [bounds, toSun]);
  const color = useMemo(() => sunColor(elevation), [elevation]);
  const intensity = sunIntensity(elevation);

  // Aim the light at the fitted bounds center.
  useEffect(() => {
    const light = lightRef.current;
    const target = targetRef.current;
    if (!light || !target) return;
    light.target = target;
    target.position.set(fit.target.x, fit.target.y, fit.target.z);
    target.updateMatrixWorld();
    light.shadow.camera.updateProjectionMatrix();
  }, [fit]);

  // Below the horizon: no sun at all (night handled by ambient/env).
  if (intensity <= 0) return null;

  return (
    <>
      <object3D ref={targetRef} />
      <directionalLight
        ref={lightRef}
        color={color}
        intensity={intensity}
        position={[fit.position.x, fit.position.y, fit.position.z]}
        castShadow={castShadow}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={fit.near}
        shadow-camera-far={fit.far}
        shadow-camera-left={-fit.halfExtent}
        shadow-camera-right={fit.halfExtent}
        shadow-camera-top={fit.halfExtent}
        shadow-camera-bottom={-fit.halfExtent}
        shadow-bias={SHADOW_BIAS}
        shadow-normalBias={SHADOW_NORMAL_BIAS}
      />
    </>
  );
}

interface LampLightsProps {
  document: SceneDocument;
  lamps: LampLightConfig[];
  castShadow: boolean;
  shadowMapSize: number;
}

function LampLights({ document, lamps, castShadow, shadowMapSize }: LampLightsProps): JSX.Element {
  return (
    <group name="lamp-lights">
      {lamps.map((lamp) => {
        if (!lamp.on) return null;
        const item = document.furniture.find((f) => f.id === lamp.furnitureItemId);
        if (!item) return null;
        // Emit from near the top of the lamp (inside the shade).
        const y = Math.max(0.2, item.dimensions.h * 0.85);
        return (
          <pointLight
            key={lamp.id}
            position={[item.position.x, y, item.position.z]}
            color={lamp.color}
            intensity={lamp.intensity}
            distance={8}
            decay={2}
            castShadow={castShadow}
            shadow-mapSize-width={shadowMapSize || 512}
            shadow-mapSize-height={shadowMapSize || 512}
            shadow-bias={SHADOW_BIAS}
            shadow-normalBias={SHADOW_NORMAL_BIAS}
          />
        );
      })}
    </group>
  );
}

/**
 * Drop this inside an r3f `<Canvas shadows>` (in place of ad-hoc lights). Reads
 * the document's sun + lamp state and the chosen quality preset.
 */
export function LightingRig({ document, quality = "medium" }: LightingRigProps): JSX.Element {
  useRendererSetup();

  const settings = qualitySettings(quality);
  const sunConfig = getSunLight(document) ?? createSunLight();
  const sun = useMemo(() => sunDirection(sunConfig), [sunConfig]);
  const sky = useMemo(() => skyColors(sun.elevation), [sun.elevation]);
  const bounds = useMemo(() => documentWorldBounds(document) ?? DEFAULT_BOUNDS, [document]);
  const lamps = getLampLights(document);

  useSkyEnvironment(sun.elevation);

  return (
    <group name="lighting-rig">
      <hemisphereLight
        color={sky.horizon}
        groundColor={sky.ground}
        intensity={sky.hemiIntensity}
      />
      <SunLight
        toSun={sun.toSun}
        elevation={sun.elevation}
        bounds={bounds}
        castShadow={settings.sunShadows}
        shadowMapSize={settings.shadowMapSize}
      />
      <LampLights
        document={document}
        lamps={lamps}
        castShadow={settings.lampShadows}
        shadowMapSize={settings.shadowMapSize}
      />
      {settings.ambientOcclusion && (
        <EffectComposer enableNormalPass multisampling={4}>
          <N8AO aoRadius={0.6} distanceFalloff={1} intensity={2} quality="medium" halfRes />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
    </group>
  );
}
