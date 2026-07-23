/**
 * 3D tab: renders the live `SceneDocument` and hosts the furniture placement
 * experience — select / drag-on-floor / rotate / delete, with grid + wall
 * snapping, collision + out-of-bounds warning (red tint), and a drag-time
 * measurement overlay to the nearest walls.
 *
 * Placement math lives in the pure, unit-tested `./furniturePlacement` module;
 * this file is the thin interaction/rendering layer over it.
 */

import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { FurnitureItem, Room, SceneDocument, Vector3 } from "@interior/core";
import { aabbOverlap, polygonCentroid } from "@interior/core";
import { LightingRig, RoomScene } from "@interior/renderer";
import { getCatalogItem } from "../catalog/catalogData";
import { CATALOG_DND_TYPE } from "./CatalogPanel";
import { FurnitureMesh } from "./FurnitureMesh";
import {
  clampToRoom,
  footprintRect,
  isInsideRoom,
  roomInteriorBounds,
  rotatedHalfExtents,
  snapPositionToGrid,
  snapToWall,
  wallDistances
} from "./furniturePlacement";
import { useSceneStore } from "../store/sceneStore";
import { PerfHud } from "../perf/PerfHud";
import { ContextLossOverlay } from "../perf/ContextLossOverlay";
import { FrameSampler } from "../perf/frameSampler";
import { setPerfCounters } from "../perf/perfStore";
import { attachContextLossHandlers, simulateContextLoss } from "../perf/contextLoss";
import { setContextLost, setSimulateContextLossFn } from "../perf/contextLossStore";
import { captureError } from "../telemetry/telemetry";

const ROTATE_STEP = Math.PI / 12; // 15° per R press / scroll notch
const WALL_SNAP_THRESHOLD = 0.15;

function GroundPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[40, 40]} />
      <meshStandardMaterial color="#cccccc" />
    </mesh>
  );
}

function documentTarget(document: SceneDocument): [number, number, number] {
  const firstRoom = document.rooms[0];
  if (!firstRoom || firstRoom.walls.length === 0) return [0, 0, 0];
  const centroid = polygonCentroid(firstRoom.walls);
  return [centroid.x, 0, centroid.y];
}

/** Compute the set of furniture ids that collide with a neighbor or poke out
 *  of the room, for red-tint warning feedback. */
function computeWarnings(furniture: FurnitureItem[], room: Room | undefined): Set<string> {
  const warn = new Set<string>();
  for (let i = 0; i < furniture.length; i++) {
    for (let j = i + 1; j < furniture.length; j++) {
      const a = furniture[i]!;
      const b = furniture[j]!;
      if (aabbOverlap(a, b)) {
        warn.add(a.id);
        warn.add(b.id);
      }
    }
  }
  if (room) {
    for (const item of furniture) {
      const { hx, hz } = rotatedHalfExtents(item.dimensions, item.rotationY);
      if (!isInsideRoom(footprintRect(item.position, hx, hz), room)) warn.add(item.id);
    }
  }
  return warn;
}

interface FurnitureLayerProps {
  furniture: FurnitureItem[];
  selectedId: string | null;
  warnings: Set<string>;
  lampOnByFurniture: Map<string, boolean>;
  onPointerDownItem: (id: string, e: ThreeEvent<PointerEvent>) => void;
}

function FurnitureLayer({ furniture, selectedId, warnings, lampOnByFurniture, onPointerDownItem }: FurnitureLayerProps) {
  return (
    <group name="furniture-layer">
      {furniture.map((item) => {
        const catalog = getCatalogItem(item.catalogId);
        const color = catalog?.color ?? "#999999";
        return (
          <group
            key={item.id}
            position={[item.position.x, 0, item.position.z]}
            rotation={[0, item.rotationY, 0]}
            onPointerDown={(e) => onPointerDownItem(item.id, e)}
          >
            <FurnitureMesh
              catalogId={item.catalogId}
              dimensions={item.dimensions}
              color={color}
              selected={item.id === selectedId}
              colliding={warnings.has(item.id)}
              lampOn={lampOnByFurniture.get(item.id) ?? false}
              modelUrl={catalog?.modelUrl}
            />
          </group>
        );
      })}
    </group>
  );
}

/** Drag-time overlay: dashed lines + labels from the item footprint to each
 *  interior wall face. */
function MeasurementOverlay({ item, room }: { item: FurnitureItem; room: Room }) {
  const inner = roomInteriorBounds(room);
  if (!inner) return null;
  const { hx, hz } = rotatedHalfExtents(item.dimensions, item.rotationY);
  const rect = footprintRect(item.position, hx, hz);
  const d = wallDistances(rect, room);
  if (!d) return null;

  const cx = item.position.x;
  const cz = item.position.z;
  const y = 0.03;

  const segs: { from: [number, number, number]; to: [number, number, number]; label: string; at: [number, number, number] }[] = [
    { from: [rect.minX, y, cz], to: [inner.minX, y, cz], label: d.minusX.toFixed(2), at: [(rect.minX + inner.minX) / 2, y, cz] },
    { from: [rect.maxX, y, cz], to: [inner.maxX, y, cz], label: d.plusX.toFixed(2), at: [(rect.maxX + inner.maxX) / 2, y, cz] },
    { from: [cx, y, rect.minZ], to: [cx, y, inner.minZ], label: d.minusZ.toFixed(2), at: [cx, y, (rect.minZ + inner.minZ) / 2] },
    { from: [cx, y, rect.maxZ], to: [cx, y, inner.maxZ], label: d.plusZ.toFixed(2), at: [cx, y, (rect.maxZ + inner.maxZ) / 2] }
  ];

  return (
    <group name="measurement-overlay">
      {segs.map((s, i) => (
        <group key={i}>
          <Line points={[s.from, s.to]} color="#1663d6" lineWidth={1.5} dashed dashSize={0.08} gapSize={0.05} />
          <Html position={s.at} center style={{ pointerEvents: "none" }}>
            <div
              style={{
                background: "rgba(22,99,214,0.9)",
                color: "#fff",
                padding: "1px 5px",
                borderRadius: 4,
                fontSize: 11,
                fontFamily: "sans-serif",
                whiteSpace: "nowrap"
              }}
            >
              {s.label} m
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

interface SceneRootProps {
  document: SceneDocument;
  target: [number, number, number];
  floorRaycastRef: React.MutableRefObject<((clientX: number, clientY: number) => Vector3 | null) | null>;
}

function SceneRoot({ document, target, floorRaycastRef }: SceneRootProps) {
  const { camera, gl } = useThree();
  const furniture = document.furniture;
  const room = document.rooms[0];

  const selection = useSceneStore((s) => s.selection);
  const furnitureGridSize = useSceneStore((s) => s.furnitureGridSize);
  const moveFurnitureItem = useSceneStore((s) => s.moveFurnitureItem);
  const rotateFurnitureItem = useSceneStore((s) => s.rotateFurnitureItem);
  const removeFurnitureItem = useSceneStore((s) => s.removeFurnitureItem);
  const selectFurniture = useSceneStore((s) => s.selectFurniture);
  const select = useSceneStore((s) => s.select);

  const selectedId = selection.type === "furniture" ? selection.itemId : null;

  const [dragging, setDragging] = useState(false);
  // { id, offset } — offset keeps the grab point stable under the cursor.
  const dragRef = useRef<{ id: string; offsetX: number; offsetZ: number } | null>(null);
  const suppressMissedRef = useRef(false);

  // Reusable raycaster + floor plane (y = 0) for turning screen points into
  // world floor positions (used for both dragging and catalog drops).
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const floorPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  const raycastFloor = useCallback(
    (clientX: number, clientY: number): Vector3 | null => {
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(floorPlane, hit)) return null;
      return { x: hit.x, y: 0, z: hit.z };
    },
    [camera, gl, raycaster, floorPlane]
  );

  // Expose the floor raycast to the DOM drop handler in the parent.
  useEffect(() => {
    floorRaycastRef.current = raycastFloor;
    return () => {
      floorRaycastRef.current = null;
    };
  }, [floorRaycastRef, raycastFloor]);

  /** Run the full placement pipeline for a desired world position and commit. */
  const placeItem = useCallback(
    (id: string, desired: Vector3) => {
      const item = useSceneStore.getState().document.furniture.find((f) => f.id === id);
      if (!item) return;
      let position: Vector3 = { x: desired.x, y: 0, z: desired.z };
      let rotationY = item.rotationY;

      position = snapPositionToGrid(position, furnitureGridSize);

      if (room) {
        const snap = snapToWall(position, item.dimensions, room, WALL_SNAP_THRESHOLD);
        if (snap) {
          position = snap.position;
          rotationY = snap.rotationY;
        }
        const { hx, hz } = rotatedHalfExtents(item.dimensions, rotationY);
        position = clampToRoom(position, hx, hz, room);
      }

      moveFurnitureItem(id, { position, rotationY });
    },
    [furnitureGridSize, room, moveFurnitureItem]
  );

  const onPointerDownItem = useCallback(
    (id: string, e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      selectFurniture(id);
      const item = useSceneStore.getState().document.furniture.find((f) => f.id === id);
      if (!item) return;
      // Grab offset so the item doesn't jump its center to the cursor.
      dragRef.current = {
        id,
        offsetX: item.position.x - e.point.x,
        offsetZ: item.position.z - e.point.z
      };
      setDragging(true);
    },
    [selectFurniture]
  );

  // Window-level drag handling: robust to the cursor leaving the item / moving
  // over other objects mid-drag.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const floor = raycastFloor(e.clientX, e.clientY);
      if (!floor) return;
      placeItem(drag.id, { x: floor.x + drag.offsetX, y: 0, z: floor.z + drag.offsetZ });
    };
    const onUp = () => {
      dragRef.current = null;
      suppressMissedRef.current = true; // keep selection after a drag
      setDragging(false);
    };
    const onWheel = (e: WheelEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      e.preventDefault();
      const item = useSceneStore.getState().document.furniture.find((f) => f.id === drag.id);
      if (!item) return;
      const delta = e.deltaY > 0 ? ROTATE_STEP : -ROTATE_STEP;
      rotateFurnitureItem(drag.id, item.rotationY + delta);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("wheel", onWheel);
    };
  }, [dragging, raycastFloor, placeItem, rotateFurnitureItem]);

  // Keyboard: R rotates, Delete/Backspace removes the selected item.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedId) return;
      if (e.key === "r" || e.key === "R") {
        const item = useSceneStore.getState().document.furniture.find((f) => f.id === selectedId);
        if (item) rotateFurnitureItem(selectedId, item.rotationY + ROTATE_STEP);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        removeFurnitureItem(selectedId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, rotateFurnitureItem, removeFurnitureItem]);

  const warnings = useMemo(() => computeWarnings(furniture, room), [furniture, room]);
  const selectedItem = selectedId ? furniture.find((f) => f.id === selectedId) : undefined;
  const lightingQuality = useSceneStore((s) => s.lightingQuality);
  const lampOnByFurniture = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const light of document.lights) {
      if (light.type === "lamp") map.set(light.furnitureItemId, light.on);
    }
    return map;
  }, [document.lights]);

  return (
    <>
      <PerfSampler />
      <ContextLossWatcher />
      <LightingRig document={document} quality={lightingQuality} />
      <GroundPlane />
      {document.rooms.length > 0 && <RoomScene document={document} />}
      <FurnitureLayer
        furniture={furniture}
        selectedId={selectedId}
        warnings={warnings}
        lampOnByFurniture={lampOnByFurniture}
        onPointerDownItem={onPointerDownItem}
      />
      {dragging && selectedItem && room && <MeasurementOverlay item={selectedItem} room={room} />}
      <OrbitControls target={target} enabled={!dragging} makeDefault />
      {/* Deselect on empty click, unless a drag just ended. */}
      <DeselectSink
        onMissed={() => {
          if (suppressMissedRef.current) {
            suppressMissedRef.current = false;
            return;
          }
          if (selection.type === "furniture") select({ type: "none" });
        }}
      />
    </>
  );
}

/** Tiny helper that registers `onPointerMissed` via the Canvas without a mesh. */
function DeselectSink({ onMissed }: { onMissed: () => void }) {
  const set = useThree((s) => s.set);
  const get = useThree((s) => s.get);
  useEffect(() => {
    const prev = get().onPointerMissed;
    set({ onPointerMissed: onMissed });
    return () => set({ onPointerMissed: prev });
  }, [onMissed, set, get]);
  return null;
}

/** Samples fps + renderer.info once per frame and publishes to the
 *  perf store (consumed by the DOM-overlay `PerfHud`). Zero React
 *  re-renders of the scene — this component never itself re-renders. */
function PerfSampler() {
  const gl = useThree((s) => s.gl);
  const samplerRef = useRef<FrameSampler | null>(null);
  if (!samplerRef.current) samplerRef.current = new FrameSampler();

  useFrame((_, delta) => {
    const sampler = samplerRef.current!;
    sampler.push(delta);
    const { fps, worstFrameFps } = sampler.sample();
    const info = gl.info;
    setPerfCounters({
      fps,
      worstFrameFps,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures
    });
  });

  return null;
}

/** Attaches webglcontextlost/webglcontextrestored listeners to the canvas,
 *  publishes loss state to the context-loss store (consumed by the
 *  DOM-overlay banner), sends a telemetry event on loss, and registers the
 *  dev "simulate loss" helper for the HUD button. */
function ContextLossWatcher() {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const canvas = gl.domElement;
    const cleanup = attachContextLossHandlers(canvas, {
      onLost: () => {
        setContextLost(true);
        captureError(new Error("WebGL context lost"), { source: "webglcontextlost" }, "warning");
      },
      onRestored: () => {
        setContextLost(false);
      }
    });
    setSimulateContextLossFn(() => simulateContextLoss(gl.getContext()));
    return () => {
      cleanup();
      setSimulateContextLossFn(null);
    };
  }, [gl]);

  return null;
}

export function Scene3D({ lightingMood = "natural" }: { lightingMood?: "natural" | "warm" | "bright" }) {
  const document = useSceneStore((s) => s.document);
  const addFurnitureItem = useSceneStore((s) => s.addFurnitureItem);
  const target = useMemo(() => documentTarget(document), [document]);
  const cameraPosition = useMemo<[number, number, number]>(
    () => [target[0] + 5, target[1] + 5, target[2] + 5],
    [target]
  );
  const floorRaycastRef = useRef<((clientX: number, clientY: number) => Vector3 | null) | null>(null);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      const catalogId = e.dataTransfer.getData(CATALOG_DND_TYPE) || e.dataTransfer.getData("text/plain");
      if (!catalogId || !getCatalogItem(catalogId)) return;
      e.preventDefault();
      const point = floorRaycastRef.current?.(e.clientX, e.clientY) ?? undefined;
      addFurnitureItem(catalogId, point);
    },
    [addFurnitureItem]
  );

  return (
    <div
      style={{ width: "100%", height: "100%", position: "relative" }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={onDrop}
    >
      <Canvas shadows camera={{ position: cameraPosition, fov: 50 }}>
        {lightingMood === "warm" && <ambientLight color="#ffebd6" intensity={0.5} />}
        {lightingMood === "bright" && <ambientLight color="#ffffff" intensity={1.5} />}
        <SceneRoot document={document} target={target} floorRaycastRef={floorRaycastRef} />
      </Canvas>
      <PerfHud />
      <ContextLossOverlay />
    </div>
  );
}
