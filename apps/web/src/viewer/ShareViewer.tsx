/**
 * Read-only 3D viewer mounted at `#/share/:token` (see `main.tsx`). Fetches
 * the shared document via `loadSharedDesign` and renders it with the same
 * room/lighting/furniture building blocks as the editor's `Scene3D`, but with
 * every editing affordance stripped: no catalog, no drag/select/rotate/delete,
 * no save, no plan editor. Orbit controls and the time-of-day slider are kept
 * — both are pure view state, not edits, and scrubbing the slider never
 * touches the server (there's nothing to save from a share link).
 */
import { useEffect, useMemo, useState } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { SceneDocument } from "@interior/core";
import { createSunLight, getLampLights, getSunLight, minutesToTime, polygonCentroid, setSunLight, timeToMinutes } from "@interior/core";
import { LightingRig, RoomScene } from "@interior/renderer";
import { getCatalogItem } from "../catalog/catalogData";
import { FurnitureMesh } from "../scene3d/FurnitureMesh";
import { loadSharedDesign, type ShareLoadResult } from "./shareViewerLogic";

export interface ShareViewerProps {
  token: string;
}

type ViewState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; document: SceneDocument };

function resultToState(result: ShareLoadResult): ViewState {
  return result.ok ? { status: "ready", document: result.document } : { status: "error", message: result.message };
}

function documentTarget(document: SceneDocument): [number, number, number] {
  const firstRoom = document.rooms[0];
  if (!firstRoom || firstRoom.walls.length === 0) return [0, 0, 0];
  const centroid = polygonCentroid(firstRoom.walls);
  return [centroid.x, 0, centroid.y];
}

function GroundPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[40, 40]} />
      <meshStandardMaterial color="#cccccc" />
    </mesh>
  );
}

function ReadOnlyScene({ document }: { document: SceneDocument }) {
  const target = useMemo(() => documentTarget(document), [document]);
  const cameraPosition = useMemo<[number, number, number]>(() => [target[0] + 5, target[1] + 5, target[2] + 5], [target]);
  const lampOnByFurniture = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const lamp of getLampLights(document)) map.set(lamp.furnitureItemId, lamp.on);
    return map;
  }, [document]);

  return (
    <Canvas shadows camera={{ position: cameraPosition, fov: 50 }}>
      <LightingRig document={document} quality="medium" />
      <GroundPlane />
      {document.rooms.length > 0 && <RoomScene document={document} />}
      <group name="furniture-layer">
        {document.furniture.map((item) => {
          const catalog = getCatalogItem(item.catalogId);
          return (
            <group key={item.id} position={[item.position.x, 0, item.position.z]} rotation={[0, item.rotationY, 0]}>
              <FurnitureMesh
                catalogId={item.catalogId}
                dimensions={item.dimensions}
                color={catalog?.color ?? "#999999"}
                lampOn={lampOnByFurniture.get(item.id) ?? false}
                modelUrl={catalog?.modelUrl}
              />
            </group>
          );
        })}
      </group>
      <OrbitControls target={target} makeDefault />
    </Canvas>
  );
}

/** View-only time-of-day slider — never persisted. Scrubbing rebuilds a local
 * copy of the document via `setSunLight` (pure, from `@interior/core`) so the
 * lighting rig reacts exactly like the editor's does. */
function TimeOfDaySlider({ document, onChange }: { document: SceneDocument; onChange: (time: string) => void }) {
  const sun = getSunLight(document) ?? createSunLight();
  const minutes = timeToMinutes(sun.time);
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#555" }}>
      Time of day — {minutesToTime(minutes)}
      <input
        type="range"
        min={0}
        max={1439}
        step={1}
        value={minutes}
        onChange={(e) => onChange(minutesToTime(Number(e.target.value)))}
        style={{ width: 180 }}
      />
    </label>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#666", fontSize: 14 }}>
      {children}
    </div>
  );
}

export function ShareViewer({ token }: ShareViewerProps) {
  const [state, setState] = useState<ViewState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    loadSharedDesign(token).then((result) => {
      if (!cancelled) setState(resultToState(result));
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  function setTime(time: string) {
    setState((prev) => (prev.status === "ready" ? { status: "ready", document: setSunLight(prev.document, { time }) } : prev));
  }

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column", fontFamily: "sans-serif" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "10px 16px",
          borderBottom: "1px solid #ddd"
        }}
      >
        <strong>{state.status === "ready" ? state.document.meta.name : "Shared design"}</strong>
        {state.status === "ready" && <TimeOfDaySlider document={state.document} onChange={setTime} />}
      </header>

      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {state.status === "loading" && <CenteredMessage>Loading shared design…</CenteredMessage>}
        {state.status === "error" && <CenteredMessage>{state.message}</CenteredMessage>}
        {state.status === "ready" && <ReadOnlyScene document={state.document} />}
      </div>

      <footer style={{ padding: "8px 16px", fontSize: 11, color: "#999", borderTop: "1px solid #eee", textAlign: "center" }}>
        View only — no account needed. Made with Interior Design Studio.
      </footer>
    </div>
  );
}
