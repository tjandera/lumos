import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, SoftShadows, Environment } from '@react-three/drei';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
} from 'postprocessing';
import { createSkyEnvironment, skyColors } from '@interior/renderer';
import { useUiStore, type Quality } from './uiStore';

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
 * After Realism unmounts SoftShadows / EffectComposer, force the interactive renderer
 * defaults back. SoftShadows patches `shadowMap.type` to VSM; if its cleanup races or
 * fails, leaving VSM + NoToneMapping causes errors and hitching with Realism OFF.
 */
export function RendererDefaults({ realism }: { realism: boolean }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (realism) return;
    const apply = () => {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.shadowMap.enabled = true;
      gl.shadowMap.type = THREE.PCFSoftShadowMap;
      gl.shadowMap.needsUpdate = true;
    };
    apply();
    // One frame later catches SoftShadows' deferred cleanup restoring a stale type.
    const id = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(id);
  }, [gl, realism]);
  return null;
}

/** Flat RoomEnvironment — only mounted when Realism is OFF so it never races HDRI dispose. */
function BasicEnvironment({ intensity }: { intensity: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const target = pmrem.fromScene(new RoomEnvironment(), 0.04);
    const env = target.texture;
    scene.environment = env;
    if (scene.background instanceof THREE.Color) scene.background = null;
    scene.environmentIntensity = intensity;

    return () => {
      if (scene.environment === env) scene.environment = null;
      target.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  useEffect(() => {
    scene.environmentIntensity = intensity;
  }, [scene, intensity]);

  return null;
}

/** Apartment HDRI + sky backdrop — only mounted when Realism is ON. */
function RealismEnvironment({
  intensity,
  elevationRad,
}: {
  intensity: number;
  elevationRad: number;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const elevKey = Math.round((elevationRad * 180) / Math.PI);
  const [hdriFailed, setHdriFailed] = useState(false);

  useEffect(() => {
    const colors = skyColors((elevKey * Math.PI) / 180);
    const bg = colors.zenith.clone().lerp(colors.horizon, 0.4);
    scene.background = bg;

    if (!hdriFailed) {
      // Clear any leftover env so drei Environment doesn't restore a disposed texture.
      scene.environment = null;
      scene.environmentIntensity = intensity;
      return () => {
        if (scene.background === bg) scene.background = null;
      };
    }

    const skyTex = createSkyEnvironment(gl, colors);
    scene.environment = skyTex;
    scene.environmentIntensity = intensity;
    return () => {
      if (scene.background === bg) scene.background = null;
      if (scene.environment === skyTex) scene.environment = null;
      skyTex.dispose();
    };
  }, [gl, scene, elevKey, hdriFailed, intensity]);

  if (hdriFailed) return null;

  return (
    <RealismSafeBoundary onError={() => setHdriFailed(true)}>
      <Environment preset="apartment" background={false} environmentIntensity={intensity} />
    </RealismSafeBoundary>
  );
}

/**
 * Image-based ambient lighting. Split into exclusive ON/OFF subtrees so toggling
 * Realism never disposes a RoomEnvironment while `<Environment>` still holds it
 * (that race was the Realism-OFF WebGL error / hitch).
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
  if (realism) {
    return <RealismEnvironment intensity={intensity} elevationRad={elevationRad} />;
  }
  return <BasicEnvironment intensity={intensity} />;
}

/**
 * Soft PCSS sun shadows + contact shadows + lamp bloom. Each piece is isolated so one
 * GPU/driver quirk can't take down the whole Realism mode.
 */
export function RealismEffects({
  quality,
  floorCenter = { x: 0, z: 0 },
  floorSpan = 12,
}: {
  quality: Quality;
  floorCenter?: { x: number; z: number };
  floorSpan?: number;
}) {
  return (
    <>
      <RealismSafeBoundary>
        <SoftShadows size={25} samples={quality === 'low' ? 8 : 16} focus={0.55} />
      </RealismSafeBoundary>
      <RealismSafeBoundary>
        <ContactShadows
<<<<<<< Updated upstream
          frames={Infinity}
=======
          key={contactShadowKey}
          frames={contactShadowFrames(quality)}
>>>>>>> Stashed changes
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
        <LampBloom quality={quality} />
      </RealismSafeBoundary>
    </>
  );
}

/** Bloom only the brightest pixels (bulbs / sun disc) — threshold high so walls stay sharp. */
function LampBloom({ quality }: { quality: Quality }) {
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
      composer.addPass(
        new EffectPass(
          camera,
          new BloomEffect({
            luminanceThreshold: 0.95,
            luminanceSmoothing: 0.2,
            intensity: 0.5,
            mipmapBlur: true,
          }),
        ),
      );
      composer.setSize(size.width, size.height);
      composerRef.current = composer;
      gl.toneMapping = THREE.NoToneMapping;
    } catch (err) {
      console.warn('[realism] bloom init failed', err);
      composer?.dispose();
      composerRef.current = null;
      gl.toneMapping = prevTone;
      return;
    }

    return () => {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      composer?.dispose();
      composerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, quality]);

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
