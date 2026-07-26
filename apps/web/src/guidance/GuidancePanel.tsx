/**
 * Guided design help, mounted inside `Scene3D`'s own layout (bottom-left of
 * the 3D view): a small dismissible "Design tips" card stack (friendly,
 * plain-language advisories from `./rules`, recomputed ~300ms after the
 * document changes) plus a one-click "Arrange for me" starter layout for
 * beginners (`./starterLayout`).
 *
 * Hovering a tip highlights the item(s) it's about by reusing the existing
 * selection highlight (`selectFurniture` -> `FurnitureMesh`'s `selected`
 * styling) rather than adding a second highlight mechanism.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Room, SceneDocument } from "@interior/core";
import { getLiveCatalog } from "../catalog/catalogData";
import { useSceneStore, type SelectionState } from "../store/sceneStore";
import { computeAdvisories, prioritizeAdvisories, MAX_ADVISORIES, type Advisory } from "./rules";
import { arrangeForMe, ROOM_TYPE_OPTIONS, type RoomType, type StarterLayoutResult } from "./starterLayout";

const DEBOUNCE_MS = 300;

/** Recomputes advisories ~300ms after `document`/`room` settle, so rapid
 *  drags don't thrash the (cheap, but not free) rule engine every frame. */
function useAdvisories(document: SceneDocument, room: Room | undefined): Advisory[] {
  const [advisories, setAdvisories] = useState<Advisory[]>([]);
  useEffect(() => {
    const handle = setTimeout(() => {
      setAdvisories(computeAdvisories(document, room, getLiveCatalog()));
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [document, room]);
  return advisories;
}

const cardBase: React.CSSProperties = {
  background: "rgba(255,255,255,0.97)",
  border: "1px solid #e0d8c8",
  borderRadius: 8,
  boxShadow: "0 2px 8px rgba(0,0,0,0.14)",
  fontFamily: "sans-serif",
  fontSize: 12.5,
  color: "#3a3226"
};

export function GuidancePanel() {
  const document = useSceneStore((s) => s.document);
  const room = document.rooms[0];
  const selectFurniture = useSceneStore((s) => s.selectFurniture);
  const select = useSceneStore((s) => s.select);
  const selection = useSceneStore((s) => s.selection);
  const batch = useSceneStore((s) => s.batch);

  const allAdvisories = useAdvisories(document, room);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // Dismissing frees a slot for the next-best tip, so filter before capping.
  const visible = useMemo(
    () => prioritizeAdvisories(allAdvisories.filter((a) => !dismissed.has(a.id)), MAX_ADVISORIES),
    [allAdvisories, dismissed]
  );

  const [roomType, setRoomType] = useState<RoomType>("living");
  const [result, setResult] = useState<StarterLayoutResult | null>(null);
  const [arranging, setArranging] = useState(false);

  // Restores whatever was selected before a hover-highlight started.
  const preHoverSelectionRef = useRef<SelectionState>(selection);

  function handleHoverStart(itemIds: string[]) {
    const first = itemIds[0];
    if (!first) return;
    preHoverSelectionRef.current = selection;
    selectFurniture(first);
  }

  function handleHoverEnd() {
    select(preHoverSelectionRef.current);
  }

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  function handleArrange() {
    setArranging(true);
    try {
      setResult(arrangeForMe(roomType, document, room, batch));
    } finally {
      setArranging(false);
    }
  }

  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        bottom: 12,
        width: 288,
        maxWidth: "calc(100% - 24px)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 5,
        pointerEvents: "none"
      }}
    >
      {visible.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map((advisory) => (
            <div
              key={advisory.id}
              onMouseEnter={() => handleHoverStart(advisory.itemIds)}
              onMouseLeave={handleHoverEnd}
              style={{ ...cardBase, padding: "8px 10px", display: "flex", gap: 8, alignItems: "flex-start", pointerEvents: "auto" }}
            >
              <span aria-hidden="true" style={{ fontSize: 14, lineHeight: "16px" }}>
                💡
              </span>
              <span style={{ flex: 1 }}>{advisory.message}</span>
              <button
                onClick={() => dismiss(advisory.id)}
                aria-label="Dismiss tip"
                style={{ border: "none", background: "transparent", cursor: "pointer", color: "#999", fontSize: 14, lineHeight: 1, padding: 0 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...cardBase, padding: "8px 10px", display: "flex", gap: 6, alignItems: "center", pointerEvents: "auto" }}>
        <span style={{ fontWeight: 600 }}>Not sure where to start?</span>
      </div>
      <div style={{ ...cardBase, padding: "8px 10px", display: "flex", gap: 6, alignItems: "center", pointerEvents: "auto" }}>
        <select
          value={roomType}
          onChange={(e) => setRoomType(e.target.value as RoomType)}
          style={{ fontSize: 12, flex: 1 }}
          aria-label="Room type"
        >
          {ROOM_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button onClick={handleArrange} disabled={!room || arranging} style={{ fontSize: 12, padding: "4px 10px", whiteSpace: "nowrap" }}>
          {arranging ? "Arranging…" : "Arrange for me"}
        </button>
      </div>

      {result && (
        <div
          style={{
            ...cardBase,
            padding: "8px 10px",
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            pointerEvents: "auto",
            background: result.applied ? "rgba(232,247,235,0.97)" : "rgba(253,236,234,0.97)",
            borderColor: result.applied ? "#b7e4c7" : "#f3b6ab"
          }}
        >
          <span style={{ flex: 1 }}>
            {result.applied ? (
              <>
                Added {result.placedCount} item{result.placedCount === 1 ? "" : "s"} to the room.
                {result.failures.length > 0 && (
                  <div style={{ marginTop: 4, color: "#8a5300" }}>Couldn't fit everything: {result.failures.join(" ")}</div>
                )}
              </>
            ) : (
              <>Couldn't arrange this room: {result.failures.join(" ") || "no free space found."}</>
            )}
          </span>
          <button
            onClick={() => setResult(null)}
            aria-label="Dismiss result"
            style={{ border: "none", background: "transparent", cursor: "pointer", color: "#999", fontSize: 14, lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
