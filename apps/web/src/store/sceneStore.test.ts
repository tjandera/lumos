import { beforeEach, describe, expect, it } from "vitest";
import { addFurniture } from "@interior/core";
import type { FurnitureItem } from "@interior/core";
import { MAX_HISTORY, useSceneStore } from "./sceneStore";

beforeEach(() => {
  useSceneStore.getState().reset();
});

describe("room drawing flow", () => {
  it("starts a room and appends wall points", () => {
    const { startRoom, addPointToActiveRoom } = useSceneStore.getState();
    const roomId = startRoom();
    addPointToActiveRoom({ x: 0, y: 0 });
    addPointToActiveRoom({ x: 4, y: 0 });
    addPointToActiveRoom({ x: 4, y: 3 });

    const room = useSceneStore.getState().document.rooms.find((r) => r.id === roomId);
    expect(room?.walls).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 }
    ]);
  });

  it("cancelDrawingRoom drops an under-specified room without polluting history", () => {
    const { startRoom, addPointToActiveRoom, cancelDrawingRoom } = useSceneStore.getState();
    const roomId = startRoom();
    addPointToActiveRoom({ x: 0, y: 0 });
    cancelDrawingRoom();

    const state = useSceneStore.getState();
    expect(state.document.rooms.find((r) => r.id === roomId)).toBeUndefined();
    expect(state.isDrawingWalls).toBe(false);
  });
});

describe("undo / redo", () => {
  it("undo reverts the last document mutation", () => {
    const { startRoom, addPointToActiveRoom, undo } = useSceneStore.getState();
    const roomId = startRoom();
    addPointToActiveRoom({ x: 0, y: 0 });
    addPointToActiveRoom({ x: 1, y: 0 });

    expect(useSceneStore.getState().document.rooms.find((r) => r.id === roomId)?.walls).toHaveLength(2);

    undo();
    expect(useSceneStore.getState().document.rooms.find((r) => r.id === roomId)?.walls).toHaveLength(1);

    undo();
    expect(useSceneStore.getState().document.rooms.find((r) => r.id === roomId)?.walls).toHaveLength(0);
  });

  it("redo replays an undone mutation", () => {
    const { startRoom, addPointToActiveRoom, undo, redo } = useSceneStore.getState();
    const roomId = startRoom();
    addPointToActiveRoom({ x: 0, y: 0 });

    undo();
    expect(useSceneStore.getState().document.rooms.find((r) => r.id === roomId)?.walls).toHaveLength(0);

    redo();
    expect(useSceneStore.getState().document.rooms.find((r) => r.id === roomId)?.walls).toHaveLength(1);
  });

  it("a new edit after undo clears the redo stack", () => {
    const { startRoom, addPointToActiveRoom, undo, redo } = useSceneStore.getState();
    const roomId = startRoom();
    addPointToActiveRoom({ x: 0, y: 0 });
    addPointToActiveRoom({ x: 1, y: 0 });

    undo(); // back to 1 point
    addPointToActiveRoom({ x: 2, y: 2 }); // new branch

    expect(useSceneStore.getState().canRedo()).toBe(false);
    expect(useSceneStore.getState().document.rooms.find((r) => r.id === roomId)?.walls).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 2 }
    ]);

    redo();
    expect(useSceneStore.getState().document.rooms.find((r) => r.id === roomId)?.walls).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 2 }
    ]);
  });

  it("canUndo/canRedo reflect stack state", () => {
    const { startRoom, undo } = useSceneStore.getState();
    expect(useSceneStore.getState().canUndo()).toBe(false);
    startRoom();
    expect(useSceneStore.getState().canUndo()).toBe(true);
    undo();
    expect(useSceneStore.getState().canUndo()).toBe(false);
    expect(useSceneStore.getState().canRedo()).toBe(true);
  });
});

describe("openings", () => {
  it("places, moves, and deletes an opening on a room's wall", () => {
    const { startRoom, addPointToActiveRoom, placeOpening, moveOpening, deleteOpening } = useSceneStore.getState();
    const roomId = startRoom();
    addPointToActiveRoom({ x: 0, y: 0 });
    addPointToActiveRoom({ x: 4, y: 0 });
    addPointToActiveRoom({ x: 4, y: 3 });

    const openingId = placeOpening(roomId, "window", 0, 1);
    let room = useSceneStore.getState().document.rooms.find((r) => r.id === roomId)!;
    expect(room.openings).toHaveLength(1);
    expect(room.openings[0]).toMatchObject({ type: "window", position: 1 });

    moveOpening(roomId, openingId, { position: 2.5 });
    room = useSceneStore.getState().document.rooms.find((r) => r.id === roomId)!;
    expect(room.openings[0]?.position).toBe(2.5);

    deleteOpening(roomId, openingId);
    room = useSceneStore.getState().document.rooms.find((r) => r.id === roomId)!;
    expect(room.openings).toHaveLength(0);
  });
});

describe("furniture actions", () => {
  function roomWithFloor() {
    const { startRoom, addPointToActiveRoom, finishDrawingRoom } = useSceneStore.getState();
    startRoom();
    addPointToActiveRoom({ x: 0, y: 0 });
    addPointToActiveRoom({ x: 4, y: 0 });
    addPointToActiveRoom({ x: 4, y: 3 });
    addPointToActiveRoom({ x: 0, y: 3 });
    finishDrawingRoom();
  }

  it("adds a catalog item at the room centroid and selects it", () => {
    roomWithFloor();
    const id = useSceneStore.getState().addFurnitureItem("sofa-3seat");
    expect(id).not.toBeNull();
    const state = useSceneStore.getState();
    const item = state.document.furniture.find((f) => f.id === id);
    expect(item).toBeDefined();
    expect(item!.catalogId).toBe("sofa-3seat");
    expect(item!.dimensions).toEqual({ w: 2.1, d: 0.9, h: 0.8 });
    // centroid of the 4x3 room is (2, 1.5) -> world (2, 0, 1.5)
    expect(item!.position.x).toBeCloseTo(2);
    expect(item!.position.z).toBeCloseTo(1.5);
    expect(state.selection).toEqual({ type: "furniture", itemId: id });
  });

  it("returns null for an unknown catalog id", () => {
    expect(useSceneStore.getState().addFurnitureItem("does-not-exist")).toBeNull();
  });

  it("honors an explicit placement position", () => {
    useSceneStore.getState().addFurnitureItem("armchair", { x: 1, y: 0, z: 2 });
    const item = useSceneStore.getState().document.furniture[0]!;
    expect(item.position).toEqual({ x: 1, y: 0, z: 2 });
  });

  it("moves and rotates an item through core ops", () => {
    const id = useSceneStore.getState().addFurnitureItem("armchair", { x: 0, y: 0, z: 0 })!;
    useSceneStore.getState().moveFurnitureItem(id, { position: { x: 2, y: 0, z: 1 } });
    useSceneStore.getState().rotateFurnitureItem(id, Math.PI / 2);
    const item = useSceneStore.getState().document.furniture.find((f) => f.id === id)!;
    expect(item.position).toEqual({ x: 2, y: 0, z: 1 });
    expect(item.rotationY).toBeCloseTo(Math.PI / 2);
  });

  it("removes an item and clears its selection", () => {
    const id = useSceneStore.getState().addFurnitureItem("armchair", { x: 0, y: 0, z: 0 })!;
    useSceneStore.getState().removeFurnitureItem(id);
    const state = useSceneStore.getState();
    expect(state.document.furniture).toHaveLength(0);
    expect(state.selection).toEqual({ type: "none" });
  });

  it("participates in undo/redo", () => {
    const id = useSceneStore.getState().addFurnitureItem("armchair", { x: 0, y: 0, z: 0 })!;
    useSceneStore.getState().moveFurnitureItem(id, { position: { x: 3, y: 0, z: 3 } });

    expect(useSceneStore.getState().document.furniture[0]!.position).toEqual({ x: 3, y: 0, z: 3 });

    useSceneStore.getState().undo(); // revert move
    expect(useSceneStore.getState().document.furniture[0]!.position).toEqual({ x: 0, y: 0, z: 0 });

    useSceneStore.getState().undo(); // revert add
    expect(useSceneStore.getState().document.furniture).toHaveLength(0);

    useSceneStore.getState().redo(); // re-add
    expect(useSceneStore.getState().document.furniture).toHaveLength(1);
    useSceneStore.getState().redo(); // re-apply move
    expect(useSceneStore.getState().document.furniture[0]!.position).toEqual({ x: 3, y: 0, z: 3 });
  });

  it("selectFurniture updates selection without a history entry", () => {
    const id = useSceneStore.getState().addFurnitureItem("armchair", { x: 0, y: 0, z: 0 })!;
    const before = useSceneStore.getState().history.past.length;
    useSceneStore.getState().selectFurniture(id);
    expect(useSceneStore.getState().history.past.length).toBe(before);
    expect(useSceneStore.getState().selection).toEqual({ type: "furniture", itemId: id });
  });
});

describe("patch-based history internals", () => {
  it("caps history depth and drops the oldest entries", () => {
    const { startRoom, addPointToActiveRoom, undo, canUndo } = useSceneStore.getState();
    const roomId = startRoom();

    const totalPoints = MAX_HISTORY + 50;
    for (let i = 0; i < totalPoints; i++) {
      addPointToActiveRoom({ x: i, y: 0 });
    }

    // startRoom + totalPoints edits = MAX_HISTORY + 51 total entries; only
    // the most recent MAX_HISTORY are kept.
    expect(useSceneStore.getState().history.past.length).toBe(MAX_HISTORY);

    for (let i = 0; i < MAX_HISTORY; i++) undo();
    expect(useSceneStore.getState().canUndo()).toBe(false);

    // The oldest (startRoom + first 50 point) edits were pruned from history
    // before they could be undone, but their effect on the document itself
    // persists: 50 points (totalPoints - MAX_HISTORY) survive.
    const room = useSceneStore.getState().document.rooms.find((r) => r.id === roomId);
    expect(room?.walls.length).toBe(50);
    expect(canUndo()).toBe(false);
  });

  it("batch() groups multiple core-function edits into a single undo entry", () => {
    const before = useSceneStore.getState().history.past.length;

    const itemA: FurnitureItem = {
      id: "furn-a",
      catalogId: "armchair",
      position: { x: 0, y: 0, z: 0 },
      rotationY: 0,
      dimensions: { w: 1, d: 1, h: 1 }
    };
    const itemB: FurnitureItem = {
      id: "furn-b",
      catalogId: "armchair",
      position: { x: 1, y: 0, z: 1 },
      rotationY: 0,
      dimensions: { w: 1, d: 1, h: 1 }
    };

    useSceneStore.getState().batch("addTwoItems", (doc) => addFurniture(addFurniture(doc, itemA), itemB));

    expect(useSceneStore.getState().document.furniture).toHaveLength(2);
    // Two core-function calls, one history entry.
    expect(useSceneStore.getState().history.past.length).toBe(before + 1);

    useSceneStore.getState().undo();
    expect(useSceneStore.getState().document.furniture).toHaveLength(0);

    useSceneStore.getState().redo();
    expect(useSceneStore.getState().document.furniture.map((f) => f.id).sort()).toEqual(["furn-a", "furn-b"]);
  });

  it("interleaved undo/redo/edit keeps document and history consistent", () => {
    const id = useSceneStore.getState().addFurnitureItem("armchair", { x: 0, y: 0, z: 0 })!;
    useSceneStore.getState().moveFurnitureItem(id, { position: { x: 1, y: 0, z: 1 } });
    useSceneStore.getState().rotateFurnitureItem(id, Math.PI / 4);

    useSceneStore.getState().undo(); // revert rotate
    useSceneStore.getState().undo(); // revert move
    expect(useSceneStore.getState().document.furniture[0]!.position).toEqual({ x: 0, y: 0, z: 0 });

    useSceneStore.getState().redo(); // re-apply move
    expect(useSceneStore.getState().document.furniture[0]!.position).toEqual({ x: 1, y: 0, z: 1 });
    expect(useSceneStore.getState().canRedo()).toBe(true);

    // A fresh edit after a partial undo/redo replay clears the remaining redo stack.
    useSceneStore.getState().rotateFurnitureItem(id, Math.PI / 2);
    expect(useSceneStore.getState().canRedo()).toBe(false);
    expect(useSceneStore.getState().document.furniture[0]!.rotationY).toBeCloseTo(Math.PI / 2);

    useSceneStore.getState().undo(); // revert the new rotate
    expect(useSceneStore.getState().document.furniture[0]!.position).toEqual({ x: 1, y: 0, z: 1 });
    useSceneStore.getState().undo(); // revert move again
    expect(useSceneStore.getState().document.furniture[0]!.position).toEqual({ x: 0, y: 0, z: 0 });
    useSceneStore.getState().undo(); // revert add
    expect(useSceneStore.getState().document.furniture).toHaveLength(0);
  });
});

describe("selection and settings", () => {
  it("updates grid size with a floor", () => {
    useSceneStore.getState().setGridSize(-5);
    expect(useSceneStore.getState().gridSize).toBeGreaterThan(0);
  });

  it("select() sets the selection state directly (no history entry)", () => {
    const { select } = useSceneStore.getState();
    const before = useSceneStore.getState().history.past.length;
    select({ type: "none" });
    expect(useSceneStore.getState().history.past.length).toBe(before);
  });
});
