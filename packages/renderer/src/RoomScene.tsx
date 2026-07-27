/**
 * React-three-fiber component that renders a scene document's rooms as 3D
 * wall and floor meshes. Kept thin: all wall-extrusion geometry construction
 * lives in the pure, testable helpers in `./wallGeometry`. This is a lighter
 * counterpart to `SceneView` — walls + floor only, no furniture/fixtures —
 * useful for hosts that bring their own furniture/fixture layers.
 */

// Importing the react-three-fiber types augments the global JSX namespace with
// the three.js intrinsic elements (<mesh>, <group>, <meshStandardMaterial>, ...).
import type {} from "@react-three/fiber";
import { useEffect, useMemo, type JSX } from "react";
import * as THREE from "three";
import type { Opening, Room, SceneDocument, Wall } from "@interior/core";
import { computeWallShape, buildWallGeometry } from "./wallGeometry.js";

export interface RoomSceneProps {
  document: SceneDocument;
  /** Wall surface color override; defaults to each room's own wall material. */
  wallColor?: string;
  /** Floor surface color override; defaults to each room's own floor material. */
  floorColor?: string;
}

interface RoomMeshesProps {
  room: Room;
  openings: Opening[];
  wallColor?: string;
  floorColor?: string;
}

function wallWorldTransform(wall: Wall): { position: [number, number, number]; rotationY: number } {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  return { position: [wall.start.x, 0, wall.start.z], rotationY: Math.atan2(-dz, dx) };
}

function roomFootprint(room: Room): { center: { x: number; z: number }; size: { x: number; z: number } } {
  const xs: number[] = [];
  const zs: number[] = [];
  for (const wall of room.walls) {
    xs.push(wall.start.x, wall.end.x);
    zs.push(wall.start.z, wall.end.z);
  }
  if (xs.length === 0) return { center: { x: 0, z: 0 }, size: { x: 0, z: 0 } };
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return { center: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 }, size: { x: maxX - minX, z: maxZ - minZ } };
}

function WallMeshes({ walls, openings, wallColor }: { walls: Wall[]; openings: Opening[]; wallColor?: string }) {
  const geometries = useMemo(
    () => walls.map((wall) => buildWallGeometry(computeWallShape(wall, openings))),
    [walls, openings],
  );
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);

  return (
    <>
      {walls.map((wall, index) => {
        const { position, rotationY } = wallWorldTransform(wall);
        return (
          <mesh
            key={wall.id}
            geometry={geometries[index]}
            position={position}
            rotation={[0, rotationY, 0]}
            castShadow
            receiveShadow
            userData={{ blocksLight: true }}
          >
            <meshStandardMaterial color={wallColor} side={THREE.DoubleSide} roughness={0.9} />
          </mesh>
        );
      })}
    </>
  );
}

function RoomMeshes({ room, openings, wallColor, floorColor }: RoomMeshesProps): JSX.Element {
  const { center, size } = useMemo(() => roomFootprint(room), [room]);
  const wall = wallColor ?? room.materials.wall.color;
  const floor = floorColor ?? room.materials.floor.color;

  return (
    <group name={`room-${room.id}`}>
      <WallMeshes walls={room.walls} openings={openings} wallColor={wall} />
      <mesh position={[center.x, 0, center.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[size.x, size.z]} />
        <meshStandardMaterial color={floor} roughness={0.85} />
      </mesh>
    </group>
  );
}

/**
 * Render every room in the document. Drop this inside an r3f `<Canvas shadows>`
 * alongside your lighting rig.
 */
export function RoomScene({ document, wallColor, floorColor }: RoomSceneProps): JSX.Element {
  return (
    <group name="room-scene">
      {document.rooms.map((room) => (
        <RoomMeshes
          key={room.id}
          room={room}
          openings={document.openings.filter((o) => room.walls.some((w) => w.id === o.wallId))}
          wallColor={wallColor}
          floorColor={floorColor}
        />
      ))}
    </group>
  );
}
