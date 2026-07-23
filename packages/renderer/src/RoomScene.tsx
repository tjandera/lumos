/**
 * React-three-fiber component that renders a scene document's rooms as 3D wall
 * and floor meshes. Kept thin: all geometry construction lives in the pure,
 * testable helpers in `./geometry3d`.
 */

// Importing the react-three-fiber types augments the global JSX namespace with
// the three.js intrinsic elements (<mesh>, <group>, <meshStandardMaterial>, ...).
import type {} from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Room, SceneDocument } from "@interior/core";
import { buildRoomGeometries } from "./geometry3d.js";

export interface RoomSceneProps {
  document: SceneDocument;
  /** Wall surface color. */
  wallColor?: string;
  /** Floor surface color. */
  floorColor?: string;
}

interface RoomMeshesProps {
  room: Room;
  wallColor: string;
  floorColor: string;
}

function RoomMeshes({ room, wallColor, floorColor }: RoomMeshesProps): JSX.Element {
  const { walls, floor } = useMemo(() => buildRoomGeometries(room), [room]);

  // Dispose GPU resources when geometry is rebuilt or the room unmounts.
  useEffect(() => {
    return () => {
      walls.forEach((g) => g.dispose());
      floor.dispose();
    };
  }, [walls, floor]);

  return (
    <group name={`room-${room.id}`}>
      {walls.map((geometry, index) => (
        <mesh
          key={index}
          geometry={geometry}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={wallColor} side={THREE.DoubleSide} roughness={0.9} />
        </mesh>
      ))}
      <mesh geometry={floor} receiveShadow>
        <meshStandardMaterial color={floorColor} roughness={0.85} />
      </mesh>
    </group>
  );
}

/**
 * Render every room in the document. Drop this inside an r3f `<Canvas shadows>`
 * alongside your lighting rig.
 */
export function RoomScene({
  document,
  wallColor = "#e8e4dc",
  floorColor = "#b7a58f"
}: RoomSceneProps): JSX.Element {
  return (
    <group name="room-scene">
      {document.rooms.map((room) => (
        <RoomMeshes key={room.id} room={room} wallColor={wallColor} floorColor={floorColor} />
      ))}
    </group>
  );
}
