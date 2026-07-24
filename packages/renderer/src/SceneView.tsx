import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  DEG2RAD,
  type SceneDocument,
  type Wall,
  type Opening,
  type FurnitureInstance,
  type LightInstance,
} from '@interior/core';
import { getCatalogItem, DEFAULT_ITEM } from '@interior/catalog';
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
}

export function SceneView({
  doc,
  cutaway = false,
  selectedFurnitureId = null,
  collidingIds,
  onSelectFurniture,
}: SceneViewProps) {
  const centroid = useMemo(() => roomCentroid(doc), [doc]);
  return (
    <group>
      <Floor doc={doc} />
      {doc.rooms.flatMap((room) =>
        room.walls.map((wall) => (
          <WallMesh key={wall.id} wall={wall} openings={doc.openings} centroid={centroid} cutaway={cutaway} />
        )),
      )}
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
        <Lamp key={light.id} light={light} />
      ))}
    </group>
  );
}

function WallMesh({
  wall,
  openings,
  centroid,
  cutaway,
}: {
  wall: Wall;
  openings: Opening[];
  centroid: { x: number; z: number };
  cutaway: boolean;
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
    >
      <meshStandardMaterial ref={matRef} color="#efeae2" />
    </mesh>
  );
}

function Floor({ doc }: { doc: SceneDocument }) {
  const { center, size } = useMemo(() => footprint(doc), [doc]);
  return (
    <mesh position={[center.x, -0.02, center.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[size.x + 0.6, size.z + 0.6]} />
      <meshStandardMaterial color="#d9d2c7" />
    </mesh>
  );
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
    <mesh
      position={[item.position.x, item.position.y + cat.height / 2, item.position.z]}
      rotation={[0, item.rotationY * DEG2RAD, 0]}
      scale={item.scale}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(item.id);
      }}
    >
      <boxGeometry args={[cat.width, cat.height, cat.depth]} />
      <meshStandardMaterial
        color={colliding ? '#ef4444' : cat.color}
        emissive={selected ? '#38bdf8' : '#000000'}
        emissiveIntensity={selected ? 0.4 : 0}
      />
    </mesh>
  );
}

function Lamp({ light }: { light: LightInstance }) {
  return (
    <group position={[light.position.x, light.position.y, light.position.z]}>
      <pointLight color={light.color} intensity={light.intensityCandela} decay={2} castShadow />
      <mesh>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshStandardMaterial color={light.color} emissive={light.color} emissiveIntensity={2} />
      </mesh>
    </group>
  );
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
