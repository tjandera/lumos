/**
 * Furniture catalog sidebar for the 3D tab. Lists catalog items grouped by
 * category with a free-text search. Clicking an item adds it to the scene at
 * the active room's centroid; items are also draggable onto the 3D canvas
 * (the canvas handles the drop and places at the cursor point).
 *
 * Data source: starts from the static `CATALOG` (instant, works offline),
 * then fetches `GET /catalog` on mount and reconciles it in via
 * `reconcileCatalog` (API items win by id; unmatched static items stay as a
 * fallback). A "fits my room" toggle re-fetches with `maxWidth`/`maxDepth`
 * query params derived from the active room's plan bounding box.
 */

import { useEffect, useMemo, useState } from "react";
import { getCatalog, isNetworkError } from "../api/client";
import { FURNITURE_CATEGORIES, getLiveCatalog, reconcileCatalog, type CatalogItem } from "../catalog/catalogData";
import { classifyFit } from "../catalog/fitStatus";
import { useSceneStore } from "../store/sceneStore";
import { formatDimsFull, formatDimsPlain } from "../components/ui/format";

/** MIME-ish key used to carry the catalog id through an HTML5 drag. */
export const CATALOG_DND_TYPE = "application/x-interior-catalog-id";

function labelForCategory(id: string): string {
  return FURNITURE_CATEGORIES.find((c) => c.id === id)?.label ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** Plan-space bounding box (in meters) of a room's wall polyline, or `null` if it has no walls. */
function roomBoundingBox(walls: { x: number; y: number }[]): { width: number; depth: number } | null {
  if (walls.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of walls) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { width: maxX - minX, depth: maxY - minY };
}

export function CatalogPanel() {
  const addFurnitureItem = useSceneStore((s) => s.addFurnitureItem);
  const activeRoomId = useSceneStore((s) => s.activeRoomId);
  const rooms = useSceneStore((s) => s.document.rooms);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CatalogItem[]>(() => getLiveCatalog());
  const [apiStatus, setApiStatus] = useState<"loading" | "online" | "offline">("loading");
  const [fitsRoom, setFitsRoom] = useState(true);
  // Mobile-only bottom sheet: collapsed by default so it doesn't block the
  // 3D view on first load; the handle (rendered only under 768px via CSS)
  // toggles it. No effect on desktop layout.
  const [sheetCollapsed, setSheetCollapsed] = useState(true);

  // The room to size "fits my room" against: the active (selected/drawn) room
  // if there is one, else the first room in the document.
  const targetRoom = useMemo(
    () => rooms.find((r) => r.id === activeRoomId) ?? rooms[0],
    [rooms, activeRoomId]
  );
  const bbox = useMemo(() => (targetRoom ? roomBoundingBox(targetRoom.walls) : null), [targetRoom]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const filters =
        fitsRoom && bbox
          ? { maxWidth: bbox.width, maxDepth: bbox.depth }
          : undefined;
      try {
        const apiItems = await getCatalog(filters);
        if (cancelled) return;
        const merged = reconcileCatalog(apiItems);
        setItems(merged);
        setApiStatus("online");
      } catch (err) {
        if (cancelled) return;
        // Offline / API down: keep whatever's already reconciled (static
        // fallback on first load, or the last known-good API list on a
        // refetch failure) rather than clearing the panel.
        setApiStatus(isNetworkError(err) ? "offline" : "online");
        setItems(getLiveCatalog());
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [fitsRoom, bbox?.width, bbox?.depth]);

  const normalized = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      items.filter(
        (item) => {
          const matchQuery = normalized === "" ||
            item.name.toLowerCase().includes(normalized) ||
            item.category.toLowerCase().includes(normalized);
            
          if (!matchQuery) return false;
          if (fitsRoom && bbox) {
            const fit = classifyFit(bbox, item.dimensions);
            if (fit.level === "does-not-fit") return false;
          }
          return true;
        }
      ),
    [items, normalized, fitsRoom, bbox]
  );
  const categoryIds = useMemo(() => {
    const known = FURNITURE_CATEGORIES.map((c) => c.id as string);
    const extra = Array.from(new Set(filtered.map((i) => i.category))).filter((c) => !known.includes(c));
    return [...known, ...extra.sort()];
  }, [filtered]);

  return (
    <div
      className={`mobile-sheet${sheetCollapsed ? " collapsed" : ""}`}
      style={{
        width: 240,
        borderRight: "1px solid #ddd",
        display: "flex",
        flexDirection: "column",
        fontFamily: "sans-serif",
        fontSize: 13,
        background: "#fff"
      }}
    >
      <button
        type="button"
        className="mobile-sheet-handle"
        onClick={() => setSheetCollapsed((c) => !c)}
        aria-expanded={!sheetCollapsed}
      >
        Catalog {sheetCollapsed ? "▴" : "▾"}
      </button>
      <div style={{ padding: 12, borderBottom: "1px solid #eee" }}>
        <h3 style={{ margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
          Catalog
          {apiStatus === "offline" && (
            <span
              title="Catalog API unreachable — showing the built-in catalog only"
              style={{ fontSize: 10, fontWeight: 400, color: "#a35b00", background: "#fff3e0", padding: "1px 6px", borderRadius: 10 }}
            >
              offline
            </span>
          )}
        </h3>
        <input
          type="search"
          placeholder="Search furniture…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px", marginBottom: 8 }}
        />
        <label
          style={{ display: "flex", alignItems: "center", gap: 6, opacity: targetRoom && bbox ? 1 : 0.5 }}
          title={targetRoom && bbox ? `Room: ${bbox.width.toFixed(2)} × ${bbox.depth.toFixed(2)} m` : "Draw a room first"}
        >
          <input
            type="checkbox"
            checked={fitsRoom}
            disabled={!targetRoom || !bbox}
            onChange={(e) => setFitsRoom(e.target.checked)}
          />
          Fits my room
        </label>
        <div style={{ fontSize: 10.5, color: "#999", marginTop: 3 }}>
          {targetRoom && bbox
            ? "Only show items that fit your drawn room, with some space to walk around."
            : "Draw a room first to filter by what fits."}
        </div>
      </div>

      <div style={{ overflowY: "auto", flex: 1, padding: 8 }}>
        {categoryIds.map((catId) => {
          const catItems = filtered.filter((i) => i.category === catId);
          if (catItems.length === 0) return null;
          return (
            <div key={catId} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, color: "#666", margin: "4px 0", fontSize: 11, textTransform: "uppercase" }}>
                {labelForCategory(catId)}
              </div>
              {catItems.map((item) => (
                <button
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(CATALOG_DND_TYPE, item.id);
                    e.dataTransfer.setData("text/plain", item.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => addFurnitureItem(item.id)}
                  title={`Add ${item.name} — ${formatDimsFull(item.dimensions)}${item.description ? `\n${item.description}` : ""}`}
                  style={{
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 8px",
                    marginBottom: 4,
                    background: "#fafafa",
                    border: "1px solid #e2e2e2",
                    borderRadius: 6,
                    cursor: "grab",
                    textAlign: "left"
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      background: item.color,
                      border: "1px solid rgba(0,0,0,0.2)",
                      flexShrink: 0
                    }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 500 }}>{item.name}</span>
                    <span style={{ display: "block", color: "#999", fontSize: 11 }}>{formatDimsPlain(item.dimensions)}</span>
                    {bbox && (() => {
                      const fit = classifyFit(bbox, item.dimensions);
                      let bg = "#ffebee";
                      let fg = "#c62828";
                      if (fit.level === "fits") { bg = "#e0f2f1"; fg = "#00695c"; }
                      else if (fit.level === "tight") { bg = "#fff3e0"; fg = "#e65100"; }
                      return (
                        <span 
                          title={fit.detail}
                          style={{
                            display: "inline-block",
                            marginTop: 4,
                            padding: "2px 6px",
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 600,
                            background: bg,
                            color: fg
                          }}
                        >
                          {fit.label}
                        </span>
                      );
                    })()}
                  </span>
                  <span style={{ color: "#333", fontVariantNumeric: "tabular-nums" }}>${item.price}</span>
                </button>
              ))}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ color: "#999", padding: 8 }}>
            {query.trim() !== "" ? (
              <>
                <p style={{ margin: "0 0 4px" }}>No items match "{query}".</p>
                <p style={{ margin: 0, fontSize: 12 }}>
                  Try a different word, or {fitsRoom && bbox ? 'turn off "Fits my room" to see more options.' : "clear the search."}
                </p>
              </>
            ) : fitsRoom && bbox ? (
              <>
                <p style={{ margin: "0 0 4px" }}>Nothing fits this room yet.</p>
                <p style={{ margin: 0, fontSize: 12 }}>Turn off "Fits my room" above to browse everything.</p>
              </>
            ) : (
              <p style={{ margin: 0 }}>No items found.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
