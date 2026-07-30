import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, SoftShadows, Environment } from '@react-three/drei';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  BloomEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  NormalPass,
  RenderPass,
  SSAOEffect,
} from 'postprocessing';
import { createSkyEnvironment, skyColors } from '@interior/renderer';
import { useUiStore, type Quality } from './uiStore';
import { contactShadowFrames } from './perfProfile';

/** Catches Realism-only failures (HDRI CDN, SoftShadows, bloom) without blanking the app. */
class RealismSafeBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; onError?: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('[realism] optional effect failed; continuing without it', error, info.componentStack);
    this.props.onError?.();
  }

  render(): ReactNode {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}

/**
 * Image-based ambient lighting.
 * Realism ON → Poly Haven "apartment" HDRI (drei CDN) for real studio reflections,
 *   with a procedural sky fallback if the CDN fails.
 * Realism OFF → flat RoomEnvironment so the toggle is obvious.
 */
export function SceneEnvironment({
  intensity = 1,
  elevationRad = Math.PI / 6,
  realism = false,
}: {
  intensity?: number;
  elevationRad?: number;
  realism?: boolean;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const elevKey = Math.round((elevationRad * 180) / Math.PI);
  const [hdriFailed, setHdriFailed] = useState(false);

  // Reset HDRI failure when leaving/re-entering Realism so a later retry can work.
  useEffect(() => {
    if (!realism) setHdriFailed(false);
  }, [realism]);

  useEffect(() => {
    if (realism && !hdriFailed) {
      const colors = skyColors((elevKey * Math.PI) / 180);
      const bg = colors.zenith.clone().lerp(colors.horizon, 0.4);
      scene.background = bg;
      return () => {
        if (scene.background === bg) scene.background = null;
      };
    }

    // OFF mode, or Realism with HDRI down — procedural env so materials still reflect.
    let env: THREE.Texture;
    let pmrem: THREE.PMREMGenerator | null = null;
    let target: THREE.WebGLRenderTarget | null = null;
    let skyTex: THREE.Texture | null = null;

    if (realism && hdriFailed) {
      const colors = skyColors((elevKey * Math.PI) / 180);
      skyTex = createSkyEnvironment(gl, colors);
      env = skyTex;
      const bg = colors.zenith.clone().lerp(colors.horizon, 0.4);
      scene.background = bg;
      const prevEnv = scene.environment;
      scene.environment = env;
      return () => {
        if (scene.environment === env) scene.environment = prevEnv;
        if (scene.background === bg) scene.background = null;
        skyTex?.dispose();
      };
    }

    pmrem = new THREE.PMREMGenerator(gl);
    target = pmrem.fromScene(new RoomEnvironment(), 0.04);
    env = target.texture;
    const prevEnv = scene.environment;
    scene.environment = env;
    if (scene.background instanceof THREE.Color) scene.background = null;

    return () => {
      if (scene.environment === env) scene.environment = prevEnv;
      target?.dispose();
      pmrem?.dispose();
    };
  }, [gl, scene, elevKey, realism, hdriFailed]);

  useEffect(() => {
    scene.environmentIntensity = intensity;
    return () => {
      scene.environmentIntensity = 1;
    };
  }, [scene, intensity]);

  if (!realism || hdriFailed) return null;

  return (
    <RealismSafeBoundary onError={() => setHdriFailed(true)}>
      <Environment preset="apartment" background={false} environmentIntensity={intensity} />
    </RealismSafeBoundary>
  );
}

/**
 * Soft PCSS sun shadows + contact shadows + lamp bloom. Each piece is isolated so one
 * GPU/driver quirk can't take down the whole Realism mode.
 */
export function RealismEffects({
  quality,
  floorCenter = { x: 0, z: 0 },
  floorSpan = 12,
  photoMode = false,
  contactShadowKey = '',
}: {
  quality: Quality;
  floorCenter?: { x: number; z: number };
  floorSpan?: number;
  /** One-shot capture in progress — adds the expensive, stills-only effects. */
  photoMode?: boolean;
  /** Changes when the furniture layout does, remounting the contact-shadow pass so it
   *  re-bakes. It renders a fixed number of frames rather than every frame. */
  contactShadowKey?: string;
}) {
  return (
    <>
      <RealismSafeBoundary>
        <SoftShadows size={25} samples={quality === 'low' ? 8 : 16} focus={0.55} />
      </RealismSafeBoundary>
      <RealismSafeBoundary>
        <ContactShadows
          key={contactShadowKey}
          // Was `Infinity`, i.e. a whole extra scene render every frame for the life of
          // the app. A couple of frames bakes the same result; the key above re-bakes it
          // when the layout actually changes.
          frames={contactShadowFrames(quality)}
          position={[floorCenter.x, 0.012, floorCenter.z]}
          opacity={0.65}
          scale={Math.max(10, floorSpan + 2)}
          blur={2.5}
          far={5.5}
          resolution={quality === 'high' ? 1024 : 512}
          color="#1a1410"
        />
      </RealismSafeBoundary>
      <RealismSafeBoundary>
        <PostEffects quality={quality} photoMode={photoMode} />
      </RealismSafeBoundary>
    </>
  );
}

/**
 * Bloom (brightest pixels only — bulbs / sun disc, threshold high so walls stay sharp)
 * plus, at the top quality tier only, screen-space ambient occlusion for contact
 * grounding in corners and under furniture. SSAO is the priciest thing in this
 * pipeline — an extra full scene normal-pass, then multi-sample occlusion lookups —
 * so it's reserved for 'high'; the quality governor already steps back down the
 * moment fps sags, which pulls this back out automatically. SSAO setup gets its own
 * inner try/catch so a driver that chokes on it still leaves bloom running.
 */
function PostEffects({ quality, photoMode }: { quality: Quality; photoMode: boolean }) {
  const { gl, scene, camera, size } = useThree();
  const composerRef = useRef<EffectComposer | null>(null);

  useEffect(() => {
    let composer: EffectComposer | null = null;
    const prevTone = gl.toneMapping;
    try {
      composer = new EffectComposer(gl, {
        multisampling: quality === 'low' ? 0 : 4,
        frameBufferType: THREE.HalfFloatType,
      });
      composer.addPass(new RenderPass(scene, camera));

      const bloom = new BloomEffect({
        luminanceThreshold: 0.95,
        luminanceSmoothing: 0.2,
        intensity: 0.5,
        mipmapBlur: true,
      });

      let ssao: SSAOEffect | null = null;
      if (quality === 'high') {
        try {
          const normalPass = new NormalPass(scene, camera, { resolutionScale: 0.75 });
          ssao = new SSAOEffect(camera, normalPass.texture, {
            samples: 10,
            rings: 4,
            radius: 0.26,
            intensity: 1.3,
            luminanceInfluence: 0.65,
            bias: 0.03,
            fade: 0.02,
            resolutionScale: 0.75,
          });
          composer.addPass(normalPass);
        } catch (err) {
          console.warn('[realism] SSAO init failed; continuing with bloom only', err);
          ssao = null;
        }
      }

      // Depth of field only during a capture. It's the single most expensive effect
      // here and it fights an interactive camera (focus lags every orbit), but in a
      // still it's most of what separates a render from a photograph. `focusDistance`
      // is normalised 0..1 across the camera's near/far range; ~4% lands on the middle
      // of a domestic room from a typical viewing position.
      let dof: DepthOfFieldEffect | null = null;
      if (photoMode) {
        try {
          dof = new DepthOfFieldEffect(camera, {
            focusDistance: 0.04,
            focalLength: 0.05,
            bokehScale: 3.2,
          });
        } catch (err) {
          console.warn('[realism] depth of field init failed; capturing without it', err);
          dof = null;
        }
      }

      const effects = [ssao, dof, bloom].filter(Boolean) as NonNullable<typeof bloom>[];
      composer.addPass(new EffectPass(camera, ...effects));
      composer.setSize(size.width, size.height);
      composerRef.current = composer;
      gl.toneMapping = THREE.NoToneMapping;
    } catch (err) {
      console.warn('[realism] post-processing init failed', err);
      composer?.dispose();
      composerRef.current = null;
      gl.toneMapping = prevTone;
      return;
    }

    return () => {
      gl.toneMapping = prevTone;
      composer?.dispose();
      composerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, quality, photoMode]);

  useEffect(() => {
    composerRef.current?.setSize(size.width, size.height);
  }, [size.width, size.height]);

  useFrame((_, delta) => {
    composerRef.current?.render(delta);
  }, 1);

  return null;
}

type OpeningLite = {
  id: string;
  wallId: string;
  kind: string;
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
  covering: { type: string; state: string };
};
type WallLite = {
  id: string;
  start: { x: number; z: number };
  end: { x: number; z: number };
};

function WindowSpot({
  position,
  lookAt,
  intensity,
  angle,
  color,
}: {
  position: [number, number, number];
  lookAt: [number, number, number];
  intensity: number;
  angle: number;
  color: string;
}) {
  const lightRef = useRef<THREE.SpotLight>(null);

  // Keep the spotlight aimed; R3F mounts `light.target` into the scene for us.
  useEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    light.target.position.set(lookAt[0], lookAt[1], lookAt[2]);
    light.target.updateMatrixWorld();
  }, [lookAt[0], lookAt[1], lookAt[2]]);

  return (
    <spotLight
      ref={lightRef}
      position={position}
      intensity={Number.isFinite(intensity) ? intensity : 0}
      color={color}
      angle={Number.isFinite(angle) ? angle : 0.7}
      penumbra={0.9}
      distance={11}
      decay={1.4}
      castShadow={false}
    >
      <object3D attach="target" position={lookAt} />
    </spotLight>
  );
}

/**
 * Soft daylight spilling through each open window — only mounted when Realism is on.
 */
export function WindowFillLights({
  openings,
  walls,
  sunDir,
  dayFactor,
  enabled,
}: {
  openings: OpeningLite[];
  walls: WallLite[];
  sunDir: { x: number; y: number; z: number };
  dayFactor: number;
  enabled: boolean;
}) {
  const lights = useMemo(() => {
    if (!enabled || dayFactor < 0.04) return [];
    const wallById = new Map((walls ?? []).map((w) => [w.id, w]));
    const out: {
      key: string;
      position: [number, number, number];
      lookAt: [number, number, number];
      intensity: number;
      angle: number;
      color: string;
    }[] = [];

    for (const o of openings ?? []) {
      if (o.kind !== 'window') continue;
      if (o.covering?.type !== 'none' && o.covering?.state === 'closed') continue;
      const wall = wallById.get(o.wallId);
      if (!wall) continue;
      const dx = wall.end.x - wall.start.x;
      const dz = wall.end.z - wall.start.z;
      const len = Math.hypot(dx, dz) || 1;
      const tx = dx / len;
      const tz = dz / len;
      let nx = dz / len;
      let nz = -dx / len;
      if (nx * sunDir.x + nz * sunDir.z < 0) {
        nx = -nx;
        nz = -nz;
      }
      const along = o.offset + o.width / 2;
      const mx = wall.start.x + tx * along;
      const mz = wall.start.z + tz * along;
      const my = o.sillHeight + o.height / 2;
      const facing = Math.max(0, nx * sunDir.x + nz * sunDir.z + sunDir.y * 0.4);
      const intensity = (1.6 + facing * 4.2) * dayFactor;
      if (intensity < 0.12) continue;
      out.push({
        key: o.id,
        position: [mx + nx * 0.55, my, mz + nz * 0.55],
        lookAt: [mx - nx * 1.4, Math.max(0.25, my * 0.4), mz - nz * 1.4],
        intensity,
        angle: Math.min(1.2, 0.55 + o.width * 0.15),
        color: sunDir.y < 0.25 ? '#ff9a55' : '#fff4dc',
      });
    }
    return out;
  }, [openings, walls, sunDir.x, sunDir.y, sunDir.z, dayFactor, enabled]);

  return (
    <>
      {lights.map(({ key, ...spot }) => (
        <WindowSpot key={key} {...spot} />
      ))}
    </>
  );
}

/** One-shot high-quality capture (max shadow quality + pixel ratio, then PNG). */
export function PhotoCapture({ active }: { active: boolean }) {
  const gl = useThree((s) => s.gl);
  const capturing = useRef(false);
  const framesWaited = useRef(0);
  const prevQuality = useRef<Quality>('med');
  const prevPixelRatio = useRef(1);
  const prevRealism = useRef(false);

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
      if (framesWaited.current >= 8) {
        try {
          const dataUrl = gl.domElement.toDataURL('image/png');
          const s = useUiStore.getState();
          s.finishPhoto(dataUrl);
        } catch (err) {
          console.warn('[capture] toDataURL failed', err);
          useUiStore.setState({ photoRequested: false, photoBusy: false, photoResult: null });
        }
        gl.setPixelRatio(prevPixelRatio.current);
        const s = useUiStore.getState();
        s.setQuality(prevQuality.current);
        if (s.enhancedRealism !== prevRealism.current) s.toggleEnhancedRealism();
        capturing.current = false;
      }
    }
  });

  return null;
}
