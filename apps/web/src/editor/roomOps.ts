/**
 * Editor-only pure functions for mutating Room/Opening data (core has no
 * room-editing helpers yet — only furniture ops). These stay outside
 * packages/core per the phase-1b scope: apps/web owns plan-editor logic.
 */
import type { Opening, Point2D, Room, SceneDocument } from "@interior/core";

function nowIso(): string {
  return new Date().toISOString();
}

function touch(doc: SceneDocument): SceneDocument["meta"] {
  return { ...doc.meta, updatedAt: nowIso() };
}

function replaceRoom(doc: SceneDocument, roomId: string, updater: (room: Room) => Room): SceneDocument {
  const index = doc.rooms.findIndex((r) => r.id === roomId);
  if (index === -1) {
    throw new Error(`Room with id "${roomId}" not found`);
  }
  const rooms = [...doc.rooms];
  rooms[index] = updater(rooms[index] as Room);
  return { ...doc, rooms, meta: touch(doc) };
}

let counter = 0;
export function generateId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export function createRoom(name = "Room", wallThickness = 0.15, height = 2.4): Room {
  return {
    id: generateId("room"),
    name,
    walls: [],
    wallThickness,
    height,
    openings: []
  };
}

export function addRoom(doc: SceneDocument, room: Room): SceneDocument {
  return { ...doc, rooms: [...doc.rooms, room], meta: touch(doc) };
}

export function removeRoom(doc: SceneDocument, roomId: string): SceneDocument {
  return { ...doc, rooms: doc.rooms.filter((r) => r.id !== roomId), meta: touch(doc) };
}

/** Append a vertex to the room's wall polyline. */
export function addWallPoint(doc: SceneDocument, roomId: string, point: Point2D): SceneDocument {
  return replaceRoom(doc, roomId, (room) => ({ ...room, walls: [...room.walls, point] }));
}

/** Replace the entire polyline (used to finalize a closed loop, or bulk edits). */
export function setWalls(doc: SceneDocument, roomId: string, walls: Point2D[]): SceneDocument {
  return replaceRoom(doc, roomId, (room) => ({ ...room, walls }));
}

/** Move a single vertex by index. */
export function updateVertex(
  doc: SceneDocument,
  roomId: string,
  vertexIndex: number,
  point: Point2D
): SceneDocument {
  return replaceRoom(doc, roomId, (room) => {
    if (vertexIndex < 0 || vertexIndex >= room.walls.length) {
      throw new Error(`Vertex index ${vertexIndex} out of range`);
    }
    const walls = [...room.walls];
    walls[vertexIndex] = point;
    return { ...room, walls };
  });
}

/** Insert a vertex at `atIndex` (defaults to appending). */
export function insertVertex(
  doc: SceneDocument,
  roomId: string,
  point: Point2D,
  atIndex?: number
): SceneDocument {
  return replaceRoom(doc, roomId, (room) => {
    const walls = [...room.walls];
    const index = atIndex ?? walls.length;
    walls.splice(index, 0, point);
    return { ...room, walls };
  });
}

/** Remove a vertex by index. Also drops any openings on the walls it touched
 * (their wallIndex is no longer meaningful) — simplest correct behavior for
 * an MVP editor. */
export function removeVertex(doc: SceneDocument, roomId: string, vertexIndex: number): SceneDocument {
  return replaceRoom(doc, roomId, (room) => {
    if (room.walls.length <= 3) {
      throw new Error("A room must have at least 3 wall points");
    }
    const walls = room.walls.filter((_, i) => i !== vertexIndex);
    const openings = room.openings.filter(
      (o) => o.wallIndex !== vertexIndex && o.wallIndex !== (vertexIndex - 1 + room.walls.length) % room.walls.length
    );
    return { ...room, walls, openings };
  });
}

export function setWallThickness(doc: SceneDocument, roomId: string, wallThickness: number): SceneDocument {
  return replaceRoom(doc, roomId, (room) => ({ ...room, wallThickness }));
}

export function setRoomHeight(doc: SceneDocument, roomId: string, height: number): SceneDocument {
  return replaceRoom(doc, roomId, (room) => ({ ...room, height }));
}

export function setRoomName(doc: SceneDocument, roomId: string, name: string): SceneDocument {
  return replaceRoom(doc, roomId, (room) => ({ ...room, name }));
}

export function addOpening(doc: SceneDocument, roomId: string, opening: Opening): SceneDocument {
  return replaceRoom(doc, roomId, (room) => ({ ...room, openings: [...room.openings, opening] }));
}

export function updateOpening(
  doc: SceneDocument,
  roomId: string,
  openingId: string,
  updates: Partial<Omit<Opening, "id">>
): SceneDocument {
  return replaceRoom(doc, roomId, (room) => {
    const index = room.openings.findIndex((o) => o.id === openingId);
    if (index === -1) throw new Error(`Opening "${openingId}" not found`);
    const openings = [...room.openings];
    openings[index] = { ...(openings[index] as Opening), ...updates };
    return { ...room, openings };
  });
}

export function removeOpening(doc: SceneDocument, roomId: string, openingId: string): SceneDocument {
  return replaceRoom(doc, roomId, (room) => ({
    ...room,
    openings: room.openings.filter((o) => o.id !== openingId)
  }));
}

export function createOpening(
  type: Opening["type"],
  wallIndex: number,
  position: number
): Opening {
  const isDoor = type === "door";
  return {
    id: generateId(type),
    type,
    wallIndex,
    position,
    width: isDoor ? 0.9 : 1.2,
    height: isDoor ? 2.0 : 1.2,
    sillHeight: isDoor ? 0 : 0.9
  };
}
