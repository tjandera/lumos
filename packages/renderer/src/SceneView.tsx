import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import {
  DEG2RAD,
  effectiveFixtureIntensity,
  finishToRoughness,
  DEFAULT_FLOOR_MATERIAL,
  DEFAULT_CEILING_MATERIAL,
  type SceneDocument,
  type Wall,
  type Opening,
  type FurnitureInstance,
  type LightInstance,
  type FixtureKind,
  type Material,
} from '@interior/core';
import { getCatalogItem, DEFAULT_ITEM, type CatalogItem } from '@interior/catalog';
import { computeWallShape, buildWallGeometry } from './wallGeometry';

/**
 * Renders a SceneDocument as 3D. Walls are extruded from their elevation profile with
 * real window/door openings (Shape-with-holes). With `cutaway` on, walls facing the
 * camera fade for a dollhouse view. The renderer only ever reads the document.
 */
export interface SceneViewProps {
  doc: SceneDocument;
  cutaway?: boolean;
  selectedFurnitureId?: string | null;
  collidingIds?: Set<string>;
  onSelectFurniture?: (id: string) => void;
  /** 0 (night) .. 1 (full daylight) — drives fixtures with `auto` dusk-ramping on. */
  dayFactor?: number;
}

export function SceneView({
  doc,
  cutaway = false,
  selectedFurnitureId = null,
  collidingIds,
  onSelectFurniture,
  dayFactor = 0,
}: SceneViewProps) {
  const centroid = useMemo(() => roomCentroid(doc), [doc]);
  return (
    <group>
      <Floor doc={doc} />
      <Ceiling doc={doc} />
      {doc.rooms.flatMap((room) =>
        room.walls.map((wall) => (
          <WallMesh
            key={wall.id}
            wall={wall}
            openings={doc.openings}
            centroid={centroid}
            cutaway={cutaway}
            material={room.materials.wall}
          />
        )),
      )}
      {doc.openings
        .filter((o) => o.kind === 'window')
        .map((o) => {
          const wall = findWallById(doc, o.wallId);
          return wall ? <WindowFill key={o.id} opening={o} wall={wall} /> : null;
        })}
      {doc.furniture.map((item) => (
        <FurnitureBox
          key={item.id}
          item={item}
          selected={item.id === selectedFurnitureId}
          colliding={collidingIds?.has(item.id) ?? false}
          onSelect={onSelectFurniture}
        />
      ))}
      {doc.lights.map((light) => (
        <Fixture key={light.id} light={light} dayFactor={dayFactor} />
      ))}
    </group>
  );
}

function WallMesh({
  wall,
  openings,
  centroid,
  cutaway,
  material,
}: {
  wall: Wall;
  openings: Opening[];
  centroid: { x: number; z: number };
  cutaway: boolean;
  material: Material;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  const geometry = useMemo(() => buildWallGeometry(computeWallShape(wall, openings)), [wall, openings]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const rotationY = Math.atan2(-dz, dx); // map the geometry's local +X onto the wall direction

  // Outward normal (XZ) pointing away from the room centroid, plus the wall midpoint.
  const { nx, nz, cx, cz } = useMemo(() => {
    const len = Math.hypot(dx, dz) || 1;
    let px = dz / len;
    let pz = -dx / len;
    const mx = (wall.start.x + wall.end.x) / 2;
    const mz = (wall.start.z + wall.end.z) / 2;
    if ((mx - centroid.x) * px + (mz - centroid.z) * pz < 0) {
      px = -px;
      pz = -pz;
    }
    return { nx: px, nz: pz, cx: mx, cz: mz };
  }, [dx, dz, wall.start.x, wall.start.z, wall.end.x, wall.end.z, centroid.x, centroid.z]);

  useFrame(({ camera }) => {
    const mat = matRef.current;
    const mesh = meshRef.current;
    if (!mat || !mesh) return;
    // Fade the wall when the camera is on its outward side (it would block the interior).
    const facesCamera =
      cutaway && (camera.position.x - cx) * nx + (camera.position.z - cz) * nz > 0.05;
    const target = facesCamera ? 0.06 : 1;
    mat.opacity += (target - mat.opacity) * 0.2;
    mat.transparent = mat.opacity < 0.98;
    mat.depthWrite = mat.opacity > 0.5;
    mesh.castShadow = mat.opacity > 0.5;
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      position={[wall.start.x, 0, wall.start.z]}
      rotation={[0, rotationY, 0]}
      castShadow
      receiveShadow
      userData={{ blocksLight: true }}
    >
      <meshStandardMaterial ref={matRef} color={material.color} roughness={finishToRoughness(material.finish)} />
    </mesh>
  );
}

function Floor({ doc }: { doc: SceneDocument }) {
  const { center, size } = useMemo(() => footprint(doc), [doc]);
  const material = doc.rooms[0]?.materials.floor ?? DEFAULT_FLOOR_MATERIAL;
  return (
    <mesh position={[center.x, -0.02, center.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[size.x + 0.6, size.z + 0.6]} />
      <meshStandardMaterial color={material.color} roughness={finishToRoughness(material.finish)} />
    </mesh>
  );
}

/**
 * A flat ceiling at the tallest wall's height. Visually fades when the camera rises
 * above it (so the default elevated/orbit view isn't blocked — mirrors WallMesh's
 * camera-relative fade) and shows when viewed from a lower, inside-the-room angle.
 * Rendered `DoubleSide` so it reliably occludes sun/lux rays approaching from either
 * side, independent of that visual fade.
 */
function Ceiling({ doc }: { doc: SceneDocument }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const { center, size } = useMemo(() => footprint(doc), [doc]);
  const material = doc.rooms[0]?.materials.ceiling ?? DEFAULT_CEILING_MATERIAL;
  const ceilingY = useMemo(() => {
    const heights = doc.rooms.flatMap((r) => r.walls.map((w) => w.height));
    return heights.length ? Math.max(...heights) : 2.7;
  }, [doc.rooms]);

  useFrame(({ camera }) => {
    const mat = matRef.current;
    const mesh = meshRef.current;
    if (!mat || !mesh) return;
    const target = camera.position.y > ceilingY - 0.15 ? 0.06 : 1;
    mat.opacity += (target - mat.opacity) * 0.2;
    mat.transparent = mat.opacity < 0.98;
    mesh.castShadow = mat.opacity > 0.5;
  });

  return (
    <mesh
      ref={meshRef}
      position={[center.x, ceilingY, center.z]}
      rotation={[Math.PI / 2, 0, 0]}
      receiveShadow
      userData={{ blocksLight: true }}
    >
      <planeGeometry args={[size.x + 0.6, size.z + 0.6]} />
      <meshStandardMaterial
        ref={matRef}
        color={material.color}
        roughness={finishToRoughness(material.finish)}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

const COVERING_LOOK: Record<'curtains' | 'blinds', { color: string; roughness: number }> = {
  curtains: { color: '#c9b79a', roughness: 0.85 },
  blinds: { color: '#d8d8d0', roughness: 0.55 },
};

/**
 * Fills a window opening: a thin tinted glass pane (always present, purely cosmetic —
 * the sun/lux studies treat glass as transmissive regardless of tint) plus, when a
 * curtain/blind is closed, an opaque covering panel tagged as a light-blocker exactly
 * like a wall. Both panes are positioned in the wall's own local frame (offset along the
 * wall, height above the floor, centered on the wall's thickness), then wrapped in a
 * group using the wall's own position + rotation — the same trick WallMesh's geometry
 * uses, so the fill lines up with the hole cut into the wall.
 */
function WindowFill({ opening, wall }: { opening: Opening; wall: Wall }) {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const rotationY = Math.atan2(-dz, dx);
  const cx = opening.offset + opening.width / 2;
  const cy = opening.sillHeight + opening.height / 2;
  const closed = opening.covering.type !== 'none' && opening.covering.state === 'closed';
  const look = closed ? COVERING_LOOK[opening.covering.type as 'curtains' | 'blinds'] : null;

  return (
    <group position={[wall.start.x, 0, wall.start.z]} rotation={[0, rotationY, 0]}>
      <mesh position={[cx, cy, 0]}>
        <planeGeometry args={[opening.width, opening.height]} />
        <meshStandardMaterial
          color="#bcd4ff"
          transparent
          opacity={0.12 + opening.glassTint * 0.5}
          roughness={0.05}
          metalness={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>
      {look && (
        <mesh
          position={[cx, cy, wall.thickness / 2 + 0.02]}
          castShadow
          receiveShadow
          userData={{ blocksLight: true }}
        >
          <planeGeometry args={[opening.width + 0.05, opening.height + 0.05]} />
          <meshStandardMaterial color={look.color} roughness={look.roughness} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

function findWallById(doc: SceneDocument, wallId: string): Wall | undefined {
  for (const room of doc.rooms) {
    const w = room.walls.find((x) => x.id === wallId);
    if (w) return w;
  }
  return undefined;
}

function FurnitureBox({
  item,
  selected,
  colliding,
  onSelect,
}: {
  item: FurnitureInstance;
  selected: boolean;
  colliding: boolean;
  onSelect?: (id: string) => void;
}) {
  const cat = getCatalogItem(item.catalogId) ?? DEFAULT_ITEM;
  return (
    <group
      position={[item.position.x, item.position.y, item.position.z]}
      rotation={[0, item.rotationY * DEG2RAD, 0]}
      scale={item.scale}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(item.id);
      }}
    >
      {cat.model ? (
        <Suspense fallback={<PlaceholderBox cat={cat} />}>
          <FurnitureModel url={cat.model} targetWidth={cat.width} />
        </Suspense>
      ) : (
        <PlaceholderBox cat={cat} />
      )}
      {(selected || colliding) && <HighlightBox cat={cat} colliding={colliding} />}
    </group>
  );
}

/** Colored box — the loading/fallback state and what non-model catalog items use. */
function PlaceholderBox({ cat }: { cat: CatalogItem }) {
  return (
    <mesh position={[0, cat.height / 2, 0]} castShadow receiveShadow>
      <boxGeometry args={[cat.width, cat.height, cat.depth]} />
      <meshStandardMaterial color={cat.color} />
    </mesh>
  );
}

/** Translucent overlay for selection (blue) / collision (red) — works over any model. */
function HighlightBox({ cat, colliding }: { cat: CatalogItem; colliding: boolean }) {
  return (
    <mesh position={[0, cat.height / 2, 0]}>
      <boxGeometry args={[cat.width * 1.05, cat.height * 1.05, cat.depth * 1.05]} />
      <meshBasicMaterial
        color={colliding ? '#ef4444' : '#38bdf8'}
        transparent
        opacity={colliding ? 0.3 : 0.16}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Loads a GLB, recenters it to the floor, and uniformly scales it to the catalog width. */
function FurnitureModel({ url, targetWidth }: { url: string; targetWidth: number }) {
  const { scene } = useGLTF(url);
  const object = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(cloned);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = size.x > 1e-4 ? targetWidth / size.x : 1;
    cloned.position.set(-center.x, -box.min.y, -center.z); // center x/z, base to y = 0
    const wrapper = new THREE.Group();
    wrapper.add(cloned);
    wrapper.scale.setScalar(s);
    return wrapper;
  }, [scene, targetWidth]);
  return <primitive object={object} />;
}

// Real Kenney fixture models (CC0), one per mount type — see LICENSES.md.
const FIXTURE_MODELS: Record<FixtureKind, string> = {
  ceiling: '/models/fixture-ceiling.glb',
  wall: '/models/fixture-wall.glb',
  floor: '/models/floor-lamp.glb',
  table: '/models/fixture-table.glb',
};
// Real-world footprint (meters) each fixture model is scaled to.
const FIXTURE_SIZE: Record<FixtureKind, number> = {
  ceiling: 0.32,
  wall: 0.22,
  floor: 0.32,
  table: 0.22,
};

function Fixture({ light, dayFactor }: { light: LightInstance; dayFactor: number }) {
  const effIntensity = effectiveFixtureIntensity(light, dayFactor);
  const isLit = effIntensity > 0;
  return (
    <group position={[light.position.x, light.position.y, light.position.z]}>
      {isLit && (
        <pointLight color={light.color} intensity={effIntensity} decay={2} castShadow={light.castShadow} />
      )}
      <Suspense fallback={<FixtureBulb light={light} lit={isLit} />}>
        <FixtureModel kind={light.kind} color={light.color} lit={isLit} />
      </Suspense>
    </group>
  );
}

/** Loading/error fallback: a small glowing (or dark, if off) sphere. */
function FixtureBulb({ light, lit }: { light: LightInstance; lit: boolean }) {
  return (
    <mesh>
      <sphereGeometry args={[0.05, 16, 16]} />
      <meshStandardMaterial
        color={light.color}
        emissive={light.color}
        emissiveIntensity={lit ? 2 : 0}
      />
    </mesh>
  );
}

/** The real fixture GLB for this mount kind, tinted/glowing to match the bulb's state. */
function FixtureModel({ kind, color, lit }: { kind: FixtureKind; color: string; lit: boolean }) {
  const { scene } = useGLTF(FIXTURE_MODELS[kind]);
  const object = useMemo(() => {
    const cloned = scene.clone(true);
    const box = new THREE.Box3().setFromObject(cloned);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const target = FIXTURE_SIZE[kind];
    const s = size.x > 1e-4 ? target / size.x : 1;
    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat && 'emissive' in mat) {
          mat.emissive = new THREE.Color(lit ? color : '#000000');
          mat.emissiveIntensity = lit ? 0.8 : 0;
        }
      }
    });
    // Ceiling/wall fixtures mount at their given position (already set to ceiling/wall
    // height by the UI); floor/table fixtures sit base-down at that position.
    const dropToBase = kind === 'floor' || kind === 'table';
    cloned.position.set(-center.x, dropToBase ? -box.min.y : -center.y, -center.z);
    const wrapper = new THREE.Group();
    wrapper.add(cloned);
    wrapper.scale.setScalar(s);
    return wrapper;
  }, [scene, kind, color, lit]);
  return <primitive object={object} />;
}

function roomCentroid(doc: SceneDocument): { x: number; z: number } {
  const xs: number[] = [];
  const zs: number[] = [];
  for (const room of doc.rooms) {
    for (const wall of room.walls) {
      xs.push(wall.start.x, wall.end.x);
      zs.push(wall.start.z, wall.end.z);
    }
  }
  if (xs.length === 0) return { x: 0, z: 0 };
  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  return { x: avg(xs), z: avg(zs) };
}

function footprint(doc: SceneDocument) {
  const xs: number[] = [];
  const zs: number[] = [];
  for (const room of doc.rooms) {
    for (const wall of room.walls) {
      xs.push(wall.start.x, wall.end.x);
      zs.push(wall.start.z, wall.end.z);
    }
  }
  if (xs.length === 0) {
    return { center: { x: 0, z: 0 }, size: { x: 6, z: 6 } };
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return {
    center: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 },
    size: { x: maxX - minX, z: maxZ - minZ },
  };
}
