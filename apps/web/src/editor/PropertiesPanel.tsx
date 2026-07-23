import type { Opening, Room } from "@interior/core";
import { useSceneStore } from "../store/sceneStore";

function NumberField({
  label,
  hint,
  value,
  step = 0.01,
  onChange
}: {
  label: string;
  /** Optional plain-language one-liner shown under the field (e.g. a typical value). */
  hint?: string;
  value: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <label style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
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
      {hint && <div style={{ fontSize: 10.5, color: "#888", marginTop: 2 }}>{hint}</div>}
    </div>
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
            hint="15 cm is typical"
            value={room.wallThickness}
            step={0.01}
            onChange={(v) => setActiveRoomWallThickness(room!.id, Math.max(0.01, v))}
          />
          <NumberField
            label="Ceiling height (m)"
            hint="2.4–2.7 m is typical"
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
        <div style={{ color: "#888" }}>
          <p style={{ marginTop: 0 }}>Nothing selected yet.</p>
          <p style={{ marginBottom: 6, fontWeight: 600, color: "#666" }}>What to do next:</p>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            <li>Click a corner of a wall to edit that point</li>
            <li>Click a window or door to resize or move it</li>
            <li>Click inside a room to edit its wall thickness and ceiling height</li>
          </ul>
        </div>
      )}
    </div>
  );
}
