import { createEmptyDocument } from "@interior/core";
import { describe, expect, it } from "vitest";
import {
  addOpening,
  addRoom,
  addWallPoint,
  createOpening,
  createRoom,
  removeVertex,
  setRoomHeight,
  setWallThickness,
  updateOpening,
  updateVertex
} from "./roomOps";

function docWithSquareRoom() {
  let doc = createEmptyDocument("test");
  const room = createRoom("Living room");
  doc = addRoom(doc, room);
  doc = addWallPoint(doc, room.id, { x: 0, y: 0 });
  doc = addWallPoint(doc, room.id, { x: 4, y: 0 });
  doc = addWallPoint(doc, room.id, { x: 4, y: 3 });
  doc = addWallPoint(doc, room.id, { x: 0, y: 3 });
  return { doc, roomId: room.id };
}

describe("room creation and wall points", () => {
  it("adds points to a room's polyline in order", () => {
    const { doc, roomId } = docWithSquareRoom();
    const room = doc.rooms.find((r) => r.id === roomId)!;
    expect(room.walls).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 }
    ]);
  });

  it("does not mutate the original document (immutability)", () => {
    const doc = createEmptyDocument("test");
    const room = createRoom();
    const next = addRoom(doc, room);
    expect(doc.rooms).toHaveLength(0);
    expect(next.rooms).toHaveLength(1);
  });

  it("bumps meta.updatedAt on edit", () => {
    const doc = createEmptyDocument("test");
    const room = createRoom();
    const next = addRoom(doc, room);
    expect(next.meta.updatedAt >= doc.meta.updatedAt).toBe(true);
  });
});

describe("updateVertex / removeVertex", () => {
  it("moves a vertex to a new point", () => {
    const { doc, roomId } = docWithSquareRoom();
    const next = updateVertex(doc, roomId, 1, { x: 5, y: 0 });
    expect(next.rooms.find((r) => r.id === roomId)!.walls[1]).toEqual({ x: 5, y: 0 });
  });

  it("throws for an out-of-range vertex index", () => {
    const { doc, roomId } = docWithSquareRoom();
    expect(() => updateVertex(doc, roomId, 99, { x: 0, y: 0 })).toThrow();
  });

  it("removes a vertex, keeping at least 3 points required elsewhere", () => {
    const { doc, roomId } = docWithSquareRoom();
    const next = removeVertex(doc, roomId, 0);
    expect(next.rooms.find((r) => r.id === roomId)!.walls).toHaveLength(3);
  });

  it("refuses to drop below 3 wall points", () => {
    const initial = docWithSquareRoom();
    const roomId = initial.roomId;
    const trimmedDoc = removeVertex(initial.doc, roomId, 0);
    expect(() => removeVertex(trimmedDoc, roomId, 0)).toThrow();
  });
});

describe("wall thickness / room height", () => {
  it("updates wall thickness", () => {
    const { doc, roomId } = docWithSquareRoom();
    const next = setWallThickness(doc, roomId, 0.25);
    expect(next.rooms.find((r) => r.id === roomId)!.wallThickness).toBe(0.25);
  });

  it("updates room height", () => {
    const { doc, roomId } = docWithSquareRoom();
    const next = setRoomHeight(doc, roomId, 2.7);
    expect(next.rooms.find((r) => r.id === roomId)!.height).toBe(2.7);
  });
});

describe("openings", () => {
  it("adds an opening using the core Opening shape", () => {
    const { doc, roomId } = docWithSquareRoom();
    const opening = createOpening("window", 0, 1.5);
    const next = addOpening(doc, roomId, opening);
    const room = next.rooms.find((r) => r.id === roomId)!;
    expect(room.openings).toHaveLength(1);
    expect(room.openings[0]).toMatchObject({ type: "window", wallIndex: 0, position: 1.5 });
  });

  it("gives sensible defaults for doors vs windows", () => {
    const door = createOpening("door", 0, 0);
    const window = createOpening("window", 0, 0);
    expect(door.sillHeight).toBe(0);
    expect(window.sillHeight).toBeGreaterThan(0);
    expect(door.height).toBeGreaterThan(window.height);
  });

  it("updates an opening's fields", () => {
    const { doc, roomId } = docWithSquareRoom();
    const opening = createOpening("door", 0, 0.5);
    let next = addOpening(doc, roomId, opening);
    next = updateOpening(next, roomId, opening.id, { width: 1.1, position: 2 });
    const updated = next.rooms.find((r) => r.id === roomId)!.openings[0]!;
    expect(updated.width).toBe(1.1);
    expect(updated.position).toBe(2);
  });
});
