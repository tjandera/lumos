import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Sky, Line } from '@react-three/drei';
import { SceneView } from '@interior/renderer';
import {
  sunVector,
  sunFromAngles,
  sunPath,
  illuminanceAt,
  effectiveFixtureIntensity,
  type SunPathPoint,
  type LampSample,
} from '@interior/core';
import { useSceneStore } from './store';
import { useUiStore, type Weather } from './uiStore';
import { useCollidingFurniture } from './collisions';
import { PerfProbe } from './PerfProbe';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const SHADOW_MAP = { low: 1024, med: 2048, high: 4096 } as const;
const SUN_DIST = 20;

const WEATHER: Record<Weather, { turbidity: number; rayleigh: number; sunMul: number; ambientMul: number }> = {
  clear: { turbidity: 6, rayleigh: 1.2, sunMul: 1.0, ambientMul: 1.0 },
  hazy: { turbidity: 12, rayleigh: 2.2, sunMul: 0.7, ambientMul: 1.35 },
  overcast: { turbidity: 20, rayleigh: 3.2, sunMul: 0.2, ambientMul: 2.0 },
  golden: { turbidity: 8, rayleigh: 2.6, sunMul: 1.05, ambientMul: 1.0 },
};

/** A glowing sun rendered far along the sun direction, so you can see it in the scene. */
function SunDisc({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <group position={[x * SUN_DIST, y * SUN_DIST, z * SUN_DIST]}>
      <mesh>
        <sphereGeometry args={[1.6, 24, 24]} />
        <meshBasicMaterial color="#fff3b0" toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[3.4, 24, 24]} />
        <meshBasicMaterial color="#ffdf6b" transparent opacity={0.25} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** The sun's daily track across the sky, with a marker every 2 hours. */
function SunPathLine({ pts }: { pts: SunPathPoint[] }) {
  const linePoints = useMemo(
    () => pts.map((p) => [p.x * SUN_DIST, p.y * SUN_DIST, p.z * SUN_DIST] as [number, number, number]),
    [pts],
  );
  if (linePoints.length < 2) return null;
  return (
    <>
      <Line points={linePoints} color="#ffd97a" lineWidth={2} transparent opacity={0.5} />
      {pts
        .filter((p) => p.minutes % 120 === 0)
        .map((p) => (
          <mesh key={p.minutes} position={[p.x * SUN_DIST, p.y * SUN_DIST, p.z * SUN_DIST]}>
            <sphereGeometry args={[0.5, 8, 8]} />
            <meshBasicMaterial color="#ffd97a" toneMapped={false} />
          </mesh>
        ))}
    </>
  );
}

/** A dashed seasonal sun-path (summer / winter) overlay. */
function SeasonLine({ pts, color }: { pts: SunPathPoint[]; color: string }) {
  const p = useMemo(
    () => pts.map((q) => [q.x * SUN_DIST, q.y * SUN_DIST, q.z * SUN_DIST] as [number, number, number]),
    [pts],
  );
  if (p.length < 2) return null;
  return <Line points={p} color={color} lineWidth={1.5} transparent opacity={0.45} dashed dashSize={0.5} gapSize={0.35} />;
}

/** A ground ring with a red arrow pointing to north (+Z per the world convention). */
function Compass() {
  const r = 3.6;
  return (
    <group position={[0, 0.015, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r, r + 0.05, 72]} />
        <meshBasicMaterial color="#6b7480" transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, 0, r + 0.18]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.13, 0.36, 12]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
    </group>
  );
}

function ToneMapping({ exposure }: { exposure: number }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);
  return null;
}

/** Advances the time-of-day while playing (~48s per full day). */
function SunAnimator({ enabled }: { enabled: boolean }) {
  useFrame((_, delta) => {
    if (!enabled) return;
    const cur = useUiStore.getState().timeMinutes;
    useUiStore.getState().setTimeMinutes((cur + delta * 30) % 1440);
  });
  return null;
}

/** Exposure 0 (shade) → 1 (full sun) mapped blue → green → red. */
function heatColor(e: number): [number, number, number] {
  const c = new THREE.Color();
  c.setHSL((1 - e) * 0.66, 0.85, 0.5);
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
}

/**
 * On-demand floor heatmap: for a grid of floor cells, raycast toward the sun across the
 * day's daytime samples and colour each cell by the fraction that reach direct sun
 * (rays that escape through a window/door or over the walls). Occludes on walls.
 */
function SolarStudy({
  lat,
  lng,
  offset,
  year,
  month,
  day,
  bounds,
}: {
  lat: number;
  lng: number;
  offset: number;
  year: number;
  month: number;
  day: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}) {
  const scene = useThree((s) => s.scene);
  const [tex, setTex] = useState<THREE.DataTexture | null>(null);

  useEffect(() => {
    const walls: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (o.userData && o.userData.isWall) walls.push(o);
    });
    const samples = sunPath(lat, lng, new Date(year, month, day), offset, 30).filter((p) => p.y > 0.06);
    const N = 28;
    const data = new Uint8Array(N * N * 4);
    const ray = new THREE.Raycaster();
    ray.far = 80;
    const origin = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const spanX = bounds.maxX - bounds.minX;
    const spanZ = bounds.maxZ - bounds.minZ;
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const wx = bounds.minX + ((ix + 0.5) / N) * spanX;
        const wz = bounds.minZ + ((iz + 0.5) / N) * spanZ;
        let lit = 0;
        for (const s of samples) {
          origin.set(wx, 0.05, wz);
          dir.set(s.x, s.y, s.z).normalize();
          ray.set(origin, dir);
          if (ray.intersectObjects(walls, true).length === 0) lit++;
        }
        const e = samples.length ? lit / samples.length : 0;
        const [r, g, b] = heatColor(e);
        const idx = (iz * N + ix) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = Math.round(40 + e * 190);
      }
    }
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    setTex(t);
    return () => t.dispose();
  }, [scene, lat, lng, offset, year, month, day, bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ]);

  if (!tex) return null;
  return (
    <mesh
      position={[(bounds.minX + bounds.maxX) / 2, 0.04, (bounds.minZ + bounds.maxZ) / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/**
 * Illuminance (lux) heatmap at the current instant: sun (if a cell sees it) + ambient
 * sky + all lamps, via the pure `illuminanceAt`. Reports the average *baseline* lux
 * (ambient + lamps, no transient sunbeam) for the "bright enough?" check.
 */
function LuxStudy({
  sun,
  lamps,
  lampsKey,
  skyLux,
  bounds,
  onAvg,
}: {
  sun: { x: number; y: number; z: number };
  lamps: LampSample[];
  lampsKey: string;
  skyLux: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  onAvg: (v: number) => void;
}) {
  const scene = useThree((s) => s.scene);
  const [tex, setTex] = useState<THREE.DataTexture | null>(null);

  useEffect(() => {
    const walls: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (o.userData && o.userData.isWall) walls.push(o);
    });
    const N = 28;
    const data = new Uint8Array(N * N * 4);
    const ray = new THREE.Raycaster();
    ray.far = 80;
    const sunDir = new THREE.Vector3(sun.x, sun.y, sun.z).normalize();
    const origin = new THREE.Vector3();
    const spanX = bounds.maxX - bounds.minX;
    const spanZ = bounds.maxZ - bounds.minZ;
    let baselineSum = 0;
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const wx = bounds.minX + ((ix + 0.5) / N) * spanX;
        const wz = bounds.minZ + ((iz + 0.5) / N) * spanZ;
        let sunLit = false;
        if (sun.y > 0.02) {
          origin.set(wx, 0.05, wz);
          ray.set(origin, sunDir);
          sunLit = ray.intersectObjects(walls, true).length === 0;
        }
        const total = illuminanceAt({ x: wx, z: wz }, { sunAltitudeSin: Math.max(0, sun.y), sunLit, lamps, skyLux });
        baselineSum += illuminanceAt({ x: wx, z: wz }, { sunAltitudeSin: 0, sunLit: false, lamps, skyLux });
        const e = Math.min(1, total / 1200);
        const [r, g, b] = heatColor(e);
        const idx = (iz * N + ix) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = Math.round(60 + e * 170);
      }
    }
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    setTex(t);
    onAvg(Math.round(baselineSum / (N * N)));
    return () => t.dispose();
  }, [scene, sun.x, sun.y, sun.z, lampsKey, skyLux, bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ, onAvg]);

  if (!tex) return null;
  return (
    <mesh
      position={[(bounds.minX + bounds.maxX) / 2, 0.045, (bounds.minZ + bounds.maxZ) / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

export function Scene3D({ active }: { active: boolean }) {
  const doc = useSceneStore((s) => s.doc);
  const cutaway = useUiStore((s) => s.cutaway);
  const selectedFurnitureId = useUiStore((s) => s.selectedFurnitureId);
  const selectFurniture = useUiStore((s) => s.selectFurniture);
  const timeMinutes = useUiStore((s) => s.timeMinutes);
  const sunMode = useUiStore((s) => s.sunMode);
  const sunAzimuthDeg = useUiStore((s) => s.sunAzimuthDeg);
  const sunElevationDeg = useUiStore((s) => s.sunElevationDeg);
  const sunIntensity = useUiStore((s) => s.sunIntensity);
  const showSun = useUiStore((s) => s.showSun);
  const showSunPath = useUiStore((s) => s.showSunPath);
  const quality = useUiStore((s) => s.quality);
  const playing = useUiStore((s) => s.playing);
  const weather = useUiStore((s) => s.weather);
  const exposure = useUiStore((s) => s.exposure);
  const sunWarmth = useUiStore((s) => s.sunWarmth);
  const showSeasons = useUiStore((s) => s.showSeasons);
  const heatmapOn = useUiStore((s) => s.heatmapOn);
  const luxOn = useUiStore((s) => s.luxOn);
  const setAvgLux = useUiStore((s) => s.setAvgLux);
  const collidingIds = useCollidingFurniture(doc);
  const cam = doc.view.camera;

  const lampSamples = useMemo<LampSample[]>(
    () =>
      doc.lights.map((l) => ({ x: l.position.x, y: l.position.y, z: l.position.z, intensityCandela: l.intensityCandela })),
    [doc.lights],
  );
  const lampsKey = useMemo(
    () =>
      doc.lights.map((l) => `${l.position.x},${l.position.y},${l.position.z},${l.intensityCandela},${l.on},${l.auto}`).join('|'),
    [doc.lights],
  );

  const studyBounds = useMemo(() => {
    const xs: number[] = [];
    const zs: number[] = [];
    for (const room of doc.rooms) for (const w of room.walls) { xs.push(w.start.x, w.end.x); zs.push(w.start.z, w.end.z); }
    if (xs.length === 0) return { minX: -3, maxX: 3, minZ: -3, maxZ: 3 };
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  }, [doc.rooms]);
  const studyDate = useMemo(() => new Date(doc.view.timeOfDay), [doc.view.timeOfDay]);

  const sun = useMemo(() => {
    if (sunMode === 'manual') return sunFromAngles(sunAzimuthDeg, sunElevationDeg);
    const base = new Date(doc.view.timeOfDay);
    const d = new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate(),
      Math.floor(timeMinutes / 60),
      timeMinutes % 60,
    );
    return sunVector(doc.site.lat, doc.site.lng, d, doc.site.trueNorthOffsetDeg);
  }, [
    sunMode,
    sunAzimuthDeg,
    sunElevationDeg,
    doc.view.timeOfDay,
    doc.site.lat,
    doc.site.lng,
    doc.site.trueNorthOffsetDeg,
    timeMinutes,
  ]);

  const pathPts = useMemo(() => {
    if (sunMode !== 'auto') return [];
    const base = new Date(doc.view.timeOfDay);
    return sunPath(doc.site.lat, doc.site.lng, base, doc.site.trueNorthOffsetDeg, 15);
  }, [sunMode, doc.view.timeOfDay, doc.site.lat, doc.site.lng, doc.site.trueNorthOffsetDeg]);

  const seasons = useMemo(() => {
    if (!showSeasons || sunMode !== 'auto') return null;
    const yr = new Date(doc.view.timeOfDay).getFullYear();
    return {
      summer: sunPath(doc.site.lat, doc.site.lng, new Date(yr, 5, 21), doc.site.trueNorthOffsetDeg, 20),
      winter: sunPath(doc.site.lat, doc.site.lng, new Date(yr, 11, 21), doc.site.trueNorthOffsetDeg, 20),
    };
  }, [showSeasons, sunMode, doc.view.timeOfDay, doc.site.lat, doc.site.lng, doc.site.trueNorthOffsetDeg]);

  const day = clamp01(sun.y * 3);
  const dist = 30;
  const shadowMap = SHADOW_MAP[quality];
  const wx = WEATHER[weather];

  // What's actually emitting right now — matches the renderer's on/off + auto-ramp
  // logic, so the lux heatmap reflects what you actually see, not the raw settings.
  const litLampSamples = useMemo(
    () =>
      lampSamples
        .map((l, i) => ({ ...l, intensityCandela: effectiveFixtureIntensity({ ...doc.lights[i], intensityCandela: l.intensityCandela }, day) }))
        .filter((l) => l.intensityCandela > 0),
    [lampSamples, doc.lights, day],
  );

  const effWarm = clamp(sunWarmth + (weather === 'golden' ? 0.4 : 0) + (1 - day) * 0.35, -1, 1);
  const sunColor = useMemo(() => {
    const c = new THREE.Color('#fff4e0');
    if (effWarm >= 0) c.lerp(new THREE.Color('#ffb060'), effWarm);
    else c.lerp(new THREE.Color('#cfe0ff'), -effWarm);
    return `#${c.getHexString()}`;
  }, [effWarm]);

  return (
    <Canvas
      frameloop={active ? 'always' : 'never'}
      shadows="soft"
      camera={{ position: [cam.position.x, cam.position.y, cam.position.z], fov: 50 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      onPointerMissed={() => selectFurniture(null)}
      onCreated={({ gl }) => {
        const canvas = gl.domElement;
        canvas.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          console.warn('[webgl] context lost — waiting for restore');
        });
        canvas.addEventListener('webglcontextrestored', () => {
          console.info('[webgl] context restored');
        });
      }}
    >
      <ToneMapping exposure={exposure} />
      {sunMode === 'auto' && <SunAnimator enabled={playing} />}

      <Sky sunPosition={[sun.x, sun.y, sun.z]} turbidity={wx.turbidity} rayleigh={day > 0.2 ? wx.rayleigh : 3} />
      <hemisphereLight intensity={(0.18 + day * 0.5) * wx.ambientMul} color="#bcd4ff" groundColor="#3a352f" />
      <ambientLight intensity={(0.05 + day * 0.12) * wx.ambientMul} />
      {sun.y > 0 && (
        <directionalLight
          position={[sun.x * dist, sun.y * dist, sun.z * dist]}
          intensity={(0.4 + day * 3.2) * sunIntensity * wx.sunMul}
          color={sunColor}
          castShadow
          shadow-mapSize={[shadowMap, shadowMap]}
          shadow-bias={-0.0002}
          shadow-normalBias={0.06}
          shadow-camera-left={-4.5}
          shadow-camera-right={4.5}
          shadow-camera-top={4.5}
          shadow-camera-bottom={-4.5}
          shadow-camera-near={0.5}
          shadow-camera-far={60}
        />
      )}
      {showSun && sun.y > -0.15 && <SunDisc x={sun.x} y={sun.y} z={sun.z} />}
      {showSunPath && (
        <>
          <Compass />
          {sunMode === 'auto' && <SunPathLine pts={pathPts} />}
        </>
      )}
      {seasons && (
        <>
          <SeasonLine pts={seasons.summer} color="#86efac" />
          <SeasonLine pts={seasons.winter} color="#93c5fd" />
        </>
      )}
      {heatmapOn && (
        <SolarStudy
          lat={doc.site.lat}
          lng={doc.site.lng}
          offset={doc.site.trueNorthOffsetDeg}
          year={studyDate.getFullYear()}
          month={studyDate.getMonth()}
          day={studyDate.getDate()}
          bounds={studyBounds}
        />
      )}
      {luxOn && (
        <LuxStudy
          sun={sun}
          lamps={litLampSamples}
          lampsKey={lampsKey + day}
          skyLux={Math.max(0, sun.y) * 2500}
          bounds={studyBounds}
          onAvg={setAvgLux}
        />
      )}

      <SceneView
        doc={doc}
        cutaway={cutaway}
        selectedFurnitureId={selectedFurnitureId}
        collidingIds={collidingIds}
        onSelectFurniture={selectFurniture}
        dayFactor={day}
      />
      <gridHelper args={[24, 24, '#2a2a30', '#202024']} position={[0, -0.03, 0]} />
      <OrbitControls
        target={[cam.target.x, cam.target.y, cam.target.z]}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={2}
        maxDistance={30}
        makeDefault
      />
      <PerfProbe />
    </Canvas>
  );
}
