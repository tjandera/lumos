import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky, Line } from '@react-three/drei';
import { SceneView } from '@interior/renderer';
import { sunVector, sunFromAngles, sunPath, type SunPathPoint } from '@interior/core';
import { useSceneStore } from './store';
import { useUiStore } from './uiStore';
import { useCollidingFurniture } from './collisions';
import { PerfProbe } from './PerfProbe';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const SHADOW_MAP = { low: 1024, med: 2048, high: 4096 } as const;
const SUN_DIST = 20;

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
function SunPath({ pts }: { pts: SunPathPoint[] }) {
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
  const collidingIds = useCollidingFurniture(doc);
  const cam = doc.view.camera;

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

  const day = clamp01(sun.y * 3);
  const dist = 30;
  const shadowMap = SHADOW_MAP[quality];

  return (
    <Canvas
      frameloop={active ? 'always' : 'never'}
      shadows="soft"
      camera={{ position: [cam.position.x, cam.position.y, cam.position.z], fov: 50 }}
      gl={{ antialias: true }}
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
      <Sky sunPosition={[sun.x, sun.y, sun.z]} turbidity={8} rayleigh={day > 0.2 ? 1.2 : 3} />
      <hemisphereLight intensity={0.18 + day * 0.5} color="#bcd4ff" groundColor="#3a352f" />
      <ambientLight intensity={0.05 + day * 0.1} />
      {sun.y > 0 && (
        <directionalLight
          position={[sun.x * dist, sun.y * dist, sun.z * dist]}
          intensity={(0.4 + day * 3.2) * sunIntensity}
          color={day > 0.4 ? '#fff6e6' : '#ffcf9e'}
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
          {sunMode === 'auto' && <SunPath pts={pathPts} />}
        </>
      )}

      <SceneView
        doc={doc}
        cutaway={cutaway}
        selectedFurnitureId={selectedFurnitureId}
        collidingIds={collidingIds}
        onSelectFurniture={selectFurniture}
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
