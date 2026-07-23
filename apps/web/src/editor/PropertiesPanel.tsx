import type { Opening, Room } from "@interior/core";
import { useSceneStore } from "../store/sceneStore";

function NumberField({
  label,
  value,
  step = 0.01,
  onChange
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, marginBottom: 6 }}>
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const n = Number.parseFloat(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
        style={{ width: 90 }}
      />
    </label>
  );
}

export function PropertiesPanel() {
  const document = useSceneStore((s) => s.document);
  const selection = useSceneStore((s) => s.selection);
  const gridSize = useSceneStore((s) => s.gridSize);
  const setGridSize = useSceneStore((s) => s.setGridSize);
  const angleSnapEnabled = useSceneStore((s) => s.angleSnapEnabled);
  const setAngleSnapEnabled = useSceneStore((s) => s.setAngleSnapEnabled);
  const setActiveRoomWallThickness = useSceneStore((s) => s.setActiveRoomWallThickness);
  const setActiveRoomHeight = useSceneStore((s) => s.setActiveRoomHeight);
  const moveOpening = useSceneStore((s) => s.moveOpening);
  const deleteOpening = useSceneStore((s) => s.deleteOpening);
  const deleteVertex = useSceneStore((s) => s.deleteVertex);

  let room: Room | undefined;
  let opening: Opening | undefined;

  if (selection.type === "room" || selection.type === "vertex") {
    room = document.rooms.find((r) => r.id === selection.roomId);
  } else if (selection.type === "opening") {
    room = document.rooms.find((r) => r.id === selection.roomId);
    opening = room?.openings.find((o) => o.id === selection.openingId);
  }

  return (
    <div
      style={{
        width: 240,
        padding: 12,
        borderLeft: "1px solid #ddd",
        fontFamily: "sans-serif",
        fontSize: 13,
        overflowY: "auto"
      }}
    >
      <h3 style={{ marginTop: 0 }}>Editor settings</h3>
      <NumberField label="Grid size (m)" value={gridSize} step={0.05} onChange={setGridSize} />
      <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={angleSnapEnabled}
          onChange={(e) => setAngleSnapEnabled(e.target.checked)}
        />
        Snap to 90°
      </label>

      {room && (
        <>
          <h3>Room</h3>
          <div style={{ marginBottom: 6, color: "#666" }}>{room.name}</div>
          <NumberField
            label="Wall thickness (m)"
            value={room.wallThickness}
            step={0.01}
            onChange={(v) => setActiveRoomWallThickness(room!.id, Math.max(0.01, v))}
          />
          <NumberField
            label="Room height (m)"
            value={room.height}
            step={0.05}
            onChange={(v) => setActiveRoomHeight(room!.id, Math.max(0.5, v))}
          />
        </>
      )}

      {selection.type === "vertex" && room && (
        <>
          <h3>Vertex</h3>
          <div style={{ marginBottom: 6, color: "#666" }}>
            Point {selection.index + 1} of {room.walls.length}
          </div>
          <button onClick={() => deleteVertex(room!.id, selection.index)} disabled={room.walls.length <= 3}>
            Delete vertex
          </button>
        </>
      )}

      {opening && room && (
        <>
          <h3>{opening.type === "door" ? "Door" : "Window"}</h3>
          <NumberField
            label="Width (m)"
            value={opening.width}
            onChange={(v) => moveOpening(room!.id, opening!.id, { width: Math.max(0.1, v) })}
          />
          <NumberField
            label="Height (m)"
            value={opening.height}
            onChange={(v) => moveOpening(room!.id, opening!.id, { height: Math.max(0.1, v) })}
          />
          <NumberField
            label="Sill height (m)"
            value={opening.sillHeight}
            onChange={(v) => moveOpening(room!.id, opening!.id, { sillHeight: Math.max(0, v) })}
          />
          <NumberField
            label="Position along wall (m)"
            value={opening.position}
            onChange={(v) => moveOpening(room!.id, opening!.id, { position: Math.max(0, v) })}
          />
          <button onClick={() => deleteOpening(room!.id, opening!.id)}>Delete</button>
        </>
      )}

      {selection.type === "none" && !room && (
        <p style={{ color: "#888" }}>Select a wall vertex, window, or door to edit its properties.</p>
      )}
    </div>
  );
}
