import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Point2D, Room } from "@interior/core";
import { useSceneStore } from "../store/sceneStore";
import { FloorPlanImport } from "../import/FloorPlanImport";
import type { PlanReference } from "../import/planReference";
import {
  closestPointOnSegment,
  distance,
  formatMeters,
  isNear,
  pointAlongWall,
  projectOntoWall,
  snapPoint,
  wallSegments
} from "./geometry";
import { computePinchZoom, pinchDistance, pinchMidpoint, type TouchPoint } from "./touchGestures";

type Tool = "select" | "draw-wall" | "add-window" | "add-door";

const VERTEX_RADIUS_PX = 6;
const OPENING_HIT_PX = 10;
const CLOSE_LOOP_RADIUS_PX = 10;

interface Viewport {
  scale: number; // pixels per meter
  offsetX: number; // px
  offsetY: number; // px
}

const DEFAULT_VIEWPORT: Viewport = { scale: 80, offsetX: 400, offsetY: 300 };

function worldToScreen(p: Point2D, vp: Viewport): Point2D {
  return { x: p.x * vp.scale + vp.offsetX, y: p.y * vp.scale + vp.offsetY };
}

function screenToWorld(p: Point2D, vp: Viewport): Point2D {
  return { x: (p.x - vp.offsetX) / vp.scale, y: (p.y - vp.offsetY) / vp.scale };
}

export function PlanEditor() {
  const document = useSceneStore((s) => s.document);
  const activeRoomId = useSceneStore((s) => s.activeRoomId);
  const isDrawingWalls = useSceneStore((s) => s.isDrawingWalls);
  const gridSize = useSceneStore((s) => s.gridSize);
  const angleSnapEnabled = useSceneStore((s) => s.angleSnapEnabled);
  const selection = useSceneStore((s) => s.selection);
  const select = useSceneStore((s) => s.select);
  const startRoom = useSceneStore((s) => s.startRoom);
  const addPointToActiveRoom = useSceneStore((s) => s.addPointToActiveRoom);
  const finishDrawingRoom = useSceneStore((s) => s.finishDrawingRoom);
  const cancelDrawingRoom = useSceneStore((s) => s.cancelDrawingRoom);
  const moveVertex = useSceneStore((s) => s.moveVertex);
  const deleteVertex = useSceneStore((s) => s.deleteVertex);
  const placeOpening = useSceneStore((s) => s.placeOpening);
  const moveOpening = useSceneStore((s) => s.moveOpening);
  const undo = useSceneStore((s) => s.undo);
  const redo = useSceneStore((s) => s.redo);

  const [tool, setTool] = useState<Tool>("select");
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [cursorWorld, setCursorWorld] = useState<Point2D | null>(null);
  const [draggingVertex, setDraggingVertex] = useState<{ roomId: string; index: number } | null>(null);
  const [draggingOpening, setDraggingOpening] = useState<{ roomId: string; openingId: string } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  // This is deliberately editor-local: uploaded plans are only tracing aids,
  // never part of a saved SceneDocument or shared design.
  const [planReference, setPlanReference] = useState<PlanReference | null>(null);
  const [showFloorPlanImport, setShowFloorPlanImport] = useState(false);
  const panStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Two-finger pinch zoom + pan (touch only). Tracks up to two active touch
  // pointers by id; when a second one arrives we snapshot the pinch state
  // and any single-pointer draw/drag/pan in progress is cancelled so the
  // gestures don't fight each other.
  const touchPointers = useRef<Map<number, TouchPoint>>(new Map());
  const pinchState = useRef<{ distance: number; center: TouchPoint } | null>(null);

  const activeRoom = useMemo(
    () => document.rooms.find((r) => r.id === activeRoomId) ?? null,
    [document.rooms, activeRoomId]
  );

  // Keyboard: undo/redo, escape, delete, space-to-pan
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.code === "Space") {
        setSpaceHeld(true);
        return;
      }
      if (e.key === "Escape") {
        if (isDrawingWalls) cancelDrawingRoom();
        setTool("select");
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selection.type === "vertex") {
        deleteVertex(selection.roomId, selection.index);
      }
      if (e.key === "Enter" && isDrawingWalls) {
        finishDrawingRoom();
        setTool("select");
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [undo, redo, isDrawingWalls, cancelDrawingRoom, finishDrawingRoom, selection, deleteVertex]);

  const getSvgPoint = useCallback((e: { clientX: number; clientY: number }): Point2D => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const screenPt = getSvgPoint(e);
    setViewport((vp) => {
      const worldBefore = screenToWorld(screenPt, vp);
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const nextScale = Math.min(400, Math.max(10, vp.scale * factor));
      const nextVp = { ...vp, scale: nextScale };
      const worldAfterScreen = worldToScreen(worldBefore, nextVp);
      return {
        ...nextVp,
        offsetX: nextVp.offsetX + (screenPt.x - worldAfterScreen.x),
        offsetY: nextVp.offsetY + (screenPt.y - worldAfterScreen.y)
      };
    });
  }, [getSvgPoint]);

  const fitToView = useCallback(() => {
    const allPoints = document.rooms.flatMap((r) => r.walls);
    const rect = svgRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 800;
    const height = rect?.height ?? 600;
    if (allPoints.length === 0) {
      setViewport({ scale: 80, offsetX: width / 2, offsetY: height / 2 });
      return;
    }
    const minX = Math.min(...allPoints.map((p) => p.x));
    const maxX = Math.max(...allPoints.map((p) => p.x));
    const minY = Math.min(...allPoints.map((p) => p.y));
    const maxY = Math.max(...allPoints.map((p) => p.y));
    const spanX = Math.max(0.5, maxX - minX);
    const spanY = Math.max(0.5, maxY - minY);
    const padding = 60;
    const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY, 400);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setViewport({ scale, offsetX: width / 2 - cx * scale, offsetY: height / 2 - cy * scale });
  }, [document.rooms]);

  const nearestSnapAnchor = useCallback(
    (room: Room | null): Point2D | undefined => {
      if (!room || room.walls.length === 0) return undefined;
      return room.walls[room.walls.length - 1];
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const screenPt = getSvgPoint(e);

      if (e.pointerType === "touch") {
        touchPointers.current.set(e.pointerId, screenPt);
        if (touchPointers.current.size === 2) {
          // Second finger down: switch into pinch mode and cancel any
          // single-touch draw/drag/pan that may have started with the first.
          const [a, b] = Array.from(touchPointers.current.values()) as [TouchPoint, TouchPoint];
          pinchState.current = { distance: pinchDistance(a, b), center: pinchMidpoint(a, b) };
          setIsPanning(false);
          panStart.current = null;
          setDraggingVertex(null);
          setDraggingOpening(null);
          return;
        }
        if (touchPointers.current.size > 2) return;
      }

      if (e.button === 1 || spaceHeld) {
        setIsPanning(true);
        panStart.current = { x: screenPt.x, y: screenPt.y, offsetX: viewport.offsetX, offsetY: viewport.offsetY };
        return;
      }

      const worldPt = screenToWorld(screenPt, viewport);

      if (tool === "draw-wall") {
        const room = activeRoom ?? document.rooms.find((r) => r.id === activeRoomId) ?? null;
        const anchor = nearestSnapAnchor(room);
        const snapped = snapPoint(worldPt, gridSize, anchor, angleSnapEnabled);

        if (!activeRoomId) {
          const id = startRoom();
          addPointToActiveRoom(snapped);
          void id;
          return;
        }

        const currentRoom = document.rooms.find((r) => r.id === activeRoomId);
        if (currentRoom && currentRoom.walls.length >= 3) {
          const first = currentRoom.walls[0] as Point2D;
          const firstScreen = worldToScreen(first, viewport);
          if (isNear(screenPt, firstScreen, CLOSE_LOOP_RADIUS_PX)) {
            finishDrawingRoom();
            setTool("select");
            return;
          }
        }
        addPointToActiveRoom(snapped);
        return;
      }

      if (tool === "add-window" || tool === "add-door") {
        for (const room of document.rooms) {
          const segments = wallSegments(room.walls);
          for (const segment of segments) {
            const hit = closestPointOnSegment(worldPt, segment);
            if (hit.distance * viewport.scale <= OPENING_HIT_PX + 6) {
              const position = projectOntoWall(worldPt, segment);
              placeOpening(room.id, tool === "add-window" ? "window" : "door", segment.index, position);
              setTool("select");
              return;
            }
          }
        }
        return;
      }

      // select tool: hit test vertices, then openings, else clear selection
      for (const room of document.rooms) {
        for (let i = 0; i < room.walls.length; i++) {
          const v = room.walls[i] as Point2D;
          if (isNear(screenPt, worldToScreen(v, viewport), VERTEX_RADIUS_PX + 4)) {
            select({ type: "vertex", roomId: room.id, index: i });
            setDraggingVertex({ roomId: room.id, index: i });
            return;
          }
        }
        const segments = wallSegments(room.walls);
        for (const opening of room.openings) {
          const segment = segments[opening.wallIndex];
          if (!segment) continue;
          const p = pointAlongWall(segment, opening.position);
          if (isNear(screenPt, worldToScreen(p, viewport), OPENING_HIT_PX)) {
            select({ type: "opening", roomId: room.id, openingId: opening.id });
            setDraggingOpening({ roomId: room.id, openingId: opening.id });
            return;
          }
        }
      }
      select({ type: "none" });
    },
    [
      getSvgPoint,
      spaceHeld,
      viewport,
      tool,
      activeRoom,
      document.rooms,
      activeRoomId,
      nearestSnapAnchor,
      gridSize,
      angleSnapEnabled,
      startRoom,
      addPointToActiveRoom,
      finishDrawingRoom,
      placeOpening,
      select
    ]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const screenPt = getSvgPoint(e);

      if (e.pointerType === "touch" && touchPointers.current.has(e.pointerId)) {
        touchPointers.current.set(e.pointerId, screenPt);
        if (touchPointers.current.size === 2 && pinchState.current) {
          const [a, b] = Array.from(touchPointers.current.values()) as [TouchPoint, TouchPoint];
          const currDistance = pinchDistance(a, b);
          const currCenter = pinchMidpoint(a, b);
          setViewport((vp) => computePinchZoom(vp, pinchState.current!.distance, pinchState.current!.center, currDistance, currCenter));
          pinchState.current = { distance: currDistance, center: currCenter };
          return;
        }
        if (touchPointers.current.size >= 2) return;
      }

      if (isPanning && panStart.current) {
        const dx = screenPt.x - panStart.current.x;
        const dy = screenPt.y - panStart.current.y;
        setViewport((vp) => ({ ...vp, offsetX: panStart.current!.offsetX + dx, offsetY: panStart.current!.offsetY + dy }));
        return;
      }

      const worldPt = screenToWorld(screenPt, viewport);

      if (draggingVertex) {
        const room = document.rooms.find((r) => r.id === draggingVertex.roomId);
        const prevIndex = room ? (draggingVertex.index - 1 + room.walls.length) % room.walls.length : undefined;
        const anchor = room && prevIndex !== undefined ? room.walls[prevIndex] : undefined;
        const snapped = snapPoint(worldPt, gridSize, anchor, angleSnapEnabled);
        moveVertex(draggingVertex.roomId, draggingVertex.index, snapped);
        setCursorWorld(snapped);
        return;
      }

      if (draggingOpening) {
        const room = document.rooms.find((r) => r.id === draggingOpening.roomId);
        const opening = room?.openings.find((o) => o.id === draggingOpening.openingId);
        if (room && opening) {
          const segment = wallSegments(room.walls)[opening.wallIndex];
          if (segment) {
            const position = projectOntoWall(worldPt, segment);
            moveOpening(room.id, opening.id, { position });
          }
        }
        return;
      }

      if (tool === "draw-wall") {
        const room = document.rooms.find((r) => r.id === activeRoomId);
        const anchor = nearestSnapAnchor(room ?? null);
        setCursorWorld(snapPoint(worldPt, gridSize, anchor, angleSnapEnabled));
        return;
      }

      setCursorWorld(worldPt);
    },
    [
      getSvgPoint,
      isPanning,
      viewport,
      draggingVertex,
      draggingOpening,
      document.rooms,
      moveVertex,
      moveOpening,
      tool,
      activeRoomId,
      nearestSnapAnchor,
      gridSize,
      angleSnapEnabled
    ]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "touch") {
      touchPointers.current.delete(e.pointerId);
      if (touchPointers.current.size < 2) pinchState.current = null;
    }
    setIsPanning(false);
    panStart.current = null;
    setDraggingVertex(null);
    setDraggingOpening(null);
  }, []);

  const gridPx = gridSize * viewport.scale;
  const showGrid = gridPx > 4;

  const cursor = isPanning || spaceHeld ? "grab" : tool === "draw-wall" ? "crosshair" : "default";

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          zIndex: 2,
          display: "flex",
          gap: 6,
          background: "rgba(255,255,255,0.9)",
          padding: 6,
          borderRadius: 6,
          fontFamily: "sans-serif",
          fontSize: 13
        }}
      >
        <button onClick={() => setTool("select")} data-active={tool === "select"}>
          Select
        </button>
        <button
          onClick={() => {
            setTool("draw-wall");
          }}
          data-active={tool === "draw-wall"}
        >
          Draw walls
        </button>
        <button onClick={() => setTool("add-window")} data-active={tool === "add-window"}>
          + Window
        </button>
        <button onClick={() => setTool("add-door")} data-active={tool === "add-door"}>
          + Door
        </button>
        <button onClick={fitToView}>Fit to view</button>
        <button onClick={undo}>Undo</button>
        <button onClick={redo}>Redo</button>
        <button onClick={() => setShowFloorPlanImport((show) => !show)} aria-expanded={showFloorPlanImport}>
          Floor plan
        </button>
        {planReference && (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <input
                type="checkbox"
                checked={planReference.visible}
                onChange={(event) => setPlanReference((current) => current && { ...current, visible: event.target.checked })}
              />
              Reference
            </label>
            <input
              aria-label="Reference opacity"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={planReference.opacity}
              onChange={(event) => setPlanReference((current) => current && { ...current, opacity: Number(event.target.value) })}
            />
          </>
        )}
      </div>

      <div
        hidden={!showFloorPlanImport}
        style={{ position: "absolute", zIndex: 2, top: 52, left: 8, padding: 10, background: "rgba(255,255,255,0.96)", border: "1px solid #ddd", borderRadius: 6 }}
      >
        <FloorPlanImport onReady={setPlanReference} existingReference={planReference} />
      </div>

      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ background: "#fafafa", touchAction: "none", cursor }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {planReference?.visible && <PlanReferenceImage reference={planReference} viewport={viewport} />}
        {showGrid && <GridPattern gridPx={gridPx} viewport={viewport} />}

        {document.rooms.map((room) => (
          <RoomShape
            key={room.id}
            room={room}
            viewport={viewport}
            selection={selection}
            isActiveDrawing={isDrawingWalls && room.id === activeRoomId}
            cursorWorld={cursorWorld}
          />
        ))}
      </svg>
    </div>
  );
}

function PlanReferenceImage({ reference, viewport }: { reference: PlanReference; viewport: Viewport }) {
  const origin = worldToScreen({ x: 0, y: 0 }, viewport);
  return (
    <image
      href={reference.sourceUrl}
      x={origin.x}
      y={origin.y}
      width={reference.widthPx * reference.metresPerPixel * viewport.scale}
      height={reference.heightPx * reference.metresPerPixel * viewport.scale}
      opacity={reference.opacity}
      preserveAspectRatio="none"
      style={{ pointerEvents: "none", userSelect: "none" }}
    />
  );
}

function GridPattern({ gridPx, viewport }: { gridPx: number; viewport: Viewport }) {
  const offsetX = ((viewport.offsetX % gridPx) + gridPx) % gridPx;
  const offsetY = ((viewport.offsetY % gridPx) + gridPx) % gridPx;
  return (
    <>
      <defs>
        <pattern id="plan-grid" width={gridPx} height={gridPx} patternUnits="userSpaceOnUse" x={offsetX} y={offsetY}>
          <circle cx={0} cy={0} r={1} fill="#d6d6d6" />
        </pattern>
      </defs>
      <rect x={0} y={0} width="100%" height="100%" fill="url(#plan-grid)" />
    </>
  );
}

function RoomShape({
  room,
  viewport,
  selection,
  isActiveDrawing,
  cursorWorld
}: {
  room: Room;
  viewport: Viewport;
  selection: ReturnType<typeof useSceneStore.getState>["selection"];
  isActiveDrawing: boolean;
  cursorWorld: Point2D | null;
}) {
  const select = useSceneStore((s) => s.select);
  const screenPoints = room.walls.map((p) => worldToScreen(p, viewport));
  const pathD =
    screenPoints.length > 0
      ? `M ${screenPoints.map((p) => `${p.x} ${p.y}`).join(" L ")}${isActiveDrawing ? "" : " Z"}`
      : "";

  const segments = wallSegments(room.walls);

  return (
    <g>
      {pathD && (
        <path
          d={pathD}
          fill={isActiveDrawing ? "none" : "rgba(79,124,255,0.08)"}
          stroke="#333"
          strokeWidth={Math.max(1, room.wallThickness * viewport.scale)}
          strokeLinejoin="round"
        />
      )}

      {isActiveDrawing && cursorWorld && screenPoints.length > 0 && (
        <>
          <line
            x1={(screenPoints[screenPoints.length - 1] as Point2D).x}
            y1={(screenPoints[screenPoints.length - 1] as Point2D).y}
            x2={worldToScreen(cursorWorld, viewport).x}
            y2={worldToScreen(cursorWorld, viewport).y}
            stroke="#4f7cff"
            strokeDasharray="4 3"
            strokeWidth={1.5}
          />
          <DimensionLabel
            a={room.walls[room.walls.length - 1] as Point2D}
            b={cursorWorld}
            viewport={viewport}
          />
        </>
      )}

      {segments.map((segment) => {
        if (isActiveDrawing) return null;
        const mid = pointAlongWall(segment, segment.length / 2);
        return (
          <DimensionLabel
            key={`dim-${segment.index}`}
            a={segment.start}
            b={segment.end}
            viewport={viewport}
            midOverride={mid}
          />
        );
      })}

      {room.openings.map((opening) => {
        const segment = segments[opening.wallIndex];
        if (!segment) return null;
        const p = pointAlongWall(segment, opening.position);
        const screen = worldToScreen(p, viewport);
        const isSelected = selection.type === "opening" && selection.openingId === opening.id;
        return (
          <circle
            key={opening.id}
            cx={screen.x}
            cy={screen.y}
            r={7}
            fill={opening.type === "door" ? "#c97b3d" : "#3d9dc9"}
            stroke={isSelected ? "#000" : "#fff"}
            strokeWidth={isSelected ? 2 : 1}
            style={{ cursor: "pointer" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              select({ type: "opening", roomId: room.id, openingId: opening.id });
            }}
          />
        );
      })}

      {room.walls.map((v, i) => {
        const screen = worldToScreen(v, viewport);
        const isSelected = selection.type === "vertex" && selection.roomId === room.id && selection.index === i;
        return (
          <circle
            key={i}
            cx={screen.x}
            cy={screen.y}
            r={VERTEX_RADIUS_PX}
            fill={isSelected ? "#ff5a3d" : "#4f7cff"}
            stroke="#fff"
            strokeWidth={1.5}
            style={{ cursor: "pointer" }}
          />
        );
      })}
    </g>
  );
}

function DimensionLabel({
  a,
  b,
  viewport,
  midOverride
}: {
  a: Point2D;
  b: Point2D;
  viewport: Viewport;
  midOverride?: Point2D;
}) {
  const len = distance(a, b);
  if (len < 0.001) return null;
  const mid = midOverride ?? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const screen = worldToScreen(mid, viewport);
  return (
    <text
      x={screen.x}
      y={screen.y - 6}
      fontSize={11}
      fontFamily="sans-serif"
      fill="#555"
      textAnchor="middle"
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      {formatMeters(len)}
    </text>
  );
}
