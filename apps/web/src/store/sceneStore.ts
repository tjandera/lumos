import { create } from "zustand";
import { enablePatches, produceWithPatches, applyPatches, type Patch } from "immer";
import type { FurnitureItem, Opening, Point2D, Room, SceneDocument, SunLightConfig, Vector3 } from "@interior/core";
import {
  addFurniture,
  addLampLight,
  createEmptyDocument,
  createLampLight,
  ensureSunLight,
  getLampForFurniture,
  moveFurniture,
  polygonCentroid,
  removeFurniture,
  removeLampLightsForFurniture,
  setLampOn,
  setSunLight as coreSetSunLight
} from "@interior/core";
import type { QualityLevel } from "@interior/renderer";
import { getCatalogItem } from "../catalog/catalogData";
import {
  addOpening,
  addRoom,
  addWallPoint,
  createOpening,
  createRoom,
  generateId,
  removeOpening,
  removeVertex,
  setRoomHeight,
  setWallThickness,
  updateOpening,
  updateVertex
} from "../editor/roomOps";

export type SelectionState =
  | { type: "none" }
  | { type: "vertex"; roomId: string; index: number }
  | { type: "opening"; roomId: string; openingId: string }
  | { type: "room"; roomId: string }
  | { type: "furniture"; itemId: string };

export type ActiveTab = "plan" | "3d";

/** The mutable fields of the scene's sun light (id/type are fixed). */
export type SunLightUpdates = Partial<Pick<SunLightConfig, "date" | "time" | "latitude" | "longitude" | "northOffset">>;

enablePatches();

/** Exported for tests; also a reasonable place to tune the undo depth. */
export const MAX_HISTORY = 200;

/**
 * One undoable edit, captured as Immer patches rather than a full document
 * snapshot. `undo` applies `inversePatches` to the *current* document; `redo`
 * re-applies `patches`. Because undo/redo only ever operate on the top of the
 * stack (strict LIFO push/pop — see `undo`/`redo` below), patches are always
 * applied against the exact document they were computed against, so there is
 * no risk of stale-path drift from intervening edits.
 *
 * Patch granularity varies by action — see `diffPatches` below and the
 * per-action notes in each call site. In short: same-length array edits
 * (move/rotate/toggle an existing item) get per-index patches; edits that
 * add/remove array entries (add room, add/remove furniture) fall back to a
 * whole-array "replace" patch for that document slice. Either way the patch
 * is scoped to the top-level document field(s) that actually changed (e.g.
 * `furniture`, `lights`, `rooms`), never the whole document — so this is
 * already a real improvement over snapshot undo, even where it isn't
 * maximally fine-grained. `label` is for debugging/devtools only.
 */
interface HistoryEntry {
  patches: Patch[];
  inversePatches: Patch[];
  label: string;
}

interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export interface SceneStoreState {
  document: SceneDocument;
  activeRoomId: string | null;
  selection: SelectionState;
  activeTab: ActiveTab;
  gridSize: number;
  furnitureGridSize: number;
  angleSnapEnabled: boolean;
  isDrawingWalls: boolean;
  history: HistoryState;
  lightingQuality: QualityLevel;
  /** Pre-drag document captured while coalescing transient sun-slider edits. */
  lightingTransientBase: SceneDocument | null;

  // Tab / view
  setActiveTab: (tab: ActiveTab) => void;
  setGridSize: (size: number) => void;
  setFurnitureGridSize: (size: number) => void;
  setAngleSnapEnabled: (enabled: boolean) => void;

  // Room / wall drawing
  startRoom: () => string;
  addPointToActiveRoom: (point: Point2D) => void;
  finishDrawingRoom: () => void;
  cancelDrawingRoom: () => void;
  moveVertex: (roomId: string, index: number, point: Point2D) => void;
  deleteVertex: (roomId: string, index: number) => void;
  setActiveRoomWallThickness: (roomId: string, thickness: number) => void;
  setActiveRoomHeight: (roomId: string, height: number) => void;

  // Openings
  placeOpening: (roomId: string, type: Opening["type"], wallIndex: number, position: number) => string;
  moveOpening: (roomId: string, openingId: string, updates: Partial<Omit<Opening, "id">>) => void;
  deleteOpening: (roomId: string, openingId: string) => void;

  // Furniture (goes through @interior/core pure ops; participates in undo/redo)
  addFurnitureItem: (catalogId: string, position?: Vector3) => string | null;
  moveFurnitureItem: (itemId: string, updates: { position?: Vector3; rotationY?: number }) => void;
  rotateFurnitureItem: (itemId: string, rotationY: number) => void;
  removeFurnitureItem: (itemId: string) => void;
  selectFurniture: (itemId: string) => void;

  // Lighting
  setLightingQuality: (quality: QualityLevel) => void;
  setSunLight: (updates: SunLightUpdates, opts?: { transient?: boolean }) => void;
  /** Flush a run of transient sun edits into a single undo entry. No-op if none pending. */
  commitSunLight: () => void;
  toggleLamp: (furnitureItemId: string, on?: boolean) => void;

  // Selection
  select: (selection: SelectionState) => void;

  // History
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  /**
   * Apply `mutate` to the current document and record the result as a single
   * undo/redo entry (Immer patches, not a snapshot) — see `HistoryEntry`.
   * `mutate` may call multiple `@interior/core` functions in sequence; only
   * the net diff is recorded, so this is the primitive for command batching
   * (e.g. a future AI-driven multi-edit command). Every built-in document
   * edit action above is itself implemented via `batch`.
   */
  batch: (label: string, mutate: (doc: SceneDocument) => SceneDocument) => SceneDocument;

  // Escape hatch for tests / bulk loads
  loadDocument: (doc: SceneDocument) => void;
  reset: () => void;
}

/** Push a new entry onto the undo stack and clear redo (a new branch of history). */
function pushHistory(history: HistoryState, entry: HistoryEntry): HistoryState {
  return { past: [...history.past, entry].slice(-MAX_HISTORY), future: [] };
}

/**
 * Diff `base` -> `next` (both plain `SceneDocument`s, not drafts) into an
 * Immer patch pair scoped to the fields that actually changed.
 *
 * `@interior/core`'s document functions are pure/immutable — they return a
 * brand-new document rather than mutating a draft — so we can't hand them
 * directly to `produceWithPatches` (that would just record one root-level
 * "replace the whole document" patch, defeating the point). Instead we run
 * the edit against the plain `base` document as usual, then replay only the
 * *changed* top-level fields onto an Immer draft of `base`:
 *
 * - Non-array fields (`meta`, and any future single-object fields like
 *   `site`) that changed by reference: whole-field replace patch.
 * - Array fields (`rooms`, `furniture`, `lights`, ...) of the *same length*
 *   in base and next: diffed index-by-index, so e.g. moving one furniture
 *   item produces a single `["furniture", i]` patch, not a whole-array
 *   replace.
 * - Array fields whose length changed (add/remove room, furniture, etc.):
 *   whole-array replace patch — still scoped to that one field, not the
 *   whole document, but not element-level. A future core-function variant
 *   that reports which indices it touched could tighten this further
 *   without any change to the undo/redo mechanics here.
 */
function diffPatches(
  base: SceneDocument,
  next: SceneDocument
): { doc: SceneDocument; patches: Patch[]; inversePatches: Patch[] } {
  const baseRecord = base as unknown as Record<string, unknown>;
  const nextRecord = next as unknown as Record<string, unknown>;
  const [doc, patches, inversePatches] = produceWithPatches(base, (draft) => {
    const draftRecord = draft as unknown as Record<string, unknown>;
    (Object.keys(next) as (keyof SceneDocument)[]).forEach((key) => {
      const baseVal = baseRecord[key as string];
      const nextVal = nextRecord[key as string];
      if (baseVal === nextVal) return;
      if (Array.isArray(baseVal) && Array.isArray(nextVal) && baseVal.length === nextVal.length) {
        const draftArr = draftRecord[key as string] as unknown[];
        for (let i = 0; i < nextVal.length; i++) {
          if (baseVal[i] !== nextVal[i]) {
            draftArr[i] = nextVal[i];
          }
        }
      } else {
        draftRecord[key as string] = nextVal;
      }
    });
  });
  return { doc, patches, inversePatches };
}

export const useSceneStore = create<SceneStoreState>((set, get) => {
  /**
   * Apply a document-transforming edit as a single undo/redo entry ("command
   * batching"). `mutate` may call one or several `@interior/core` functions
   * in sequence — only the net before/after diff is recorded, so multi-step
   * edits (e.g. adding furniture + its lamp light, or removing furniture +
   * its lamp light) already collapse into one history entry with no extra
   * bookkeeping. Exported on the store as `batch` for the same reason: future
   * multi-edit commands (e.g. AI-driven) can group arbitrarily many core
   * calls into one undo step by passing a `mutate` that runs them all.
   */
  function batch(label: string, mutate: (doc: SceneDocument) => SceneDocument): SceneDocument {
    const { document, history } = get();
    const next = mutate(document);
    const { doc, patches, inversePatches } = diffPatches(document, next);
    set({ document: doc, history: pushHistory(history, { patches, inversePatches, label }) });
    return doc;
  }

  return {
    document: ensureSunLight(createEmptyDocument("Untitled design")),
    activeRoomId: null,
    selection: { type: "none" },
    activeTab: "plan",
    gridSize: 0.1,
    furnitureGridSize: 0.05,
    angleSnapEnabled: true,
    isDrawingWalls: false,
    history: { past: [], future: [] },
    lightingQuality: "medium",
    lightingTransientBase: null,

    setActiveTab: (tab) => set({ activeTab: tab }),
    setGridSize: (size) => set({ gridSize: Math.max(0.01, size) }),
    setFurnitureGridSize: (size) => set({ furnitureGridSize: Math.max(0, size) }),
    setAngleSnapEnabled: (enabled) => set({ angleSnapEnabled: enabled }),

    startRoom: () => {
      const room = createRoom();
      batch("addRoom", (doc) => addRoom(doc, room));
      set({ activeRoomId: room.id, isDrawingWalls: true, selection: { type: "room", roomId: room.id } });
      return room.id;
    },

    addPointToActiveRoom: (point) => {
      const { activeRoomId } = get();
      if (!activeRoomId) return;
      batch("addWallPoint", (doc) => addWallPoint(doc, activeRoomId, point));
    },

    finishDrawingRoom: () => {
      set({ isDrawingWalls: false });
    },

    cancelDrawingRoom: () => {
      const { activeRoomId, document } = get();
      if (!activeRoomId) {
        set({ isDrawingWalls: false });
        return;
      }
      const room = document.rooms.find((r) => r.id === activeRoomId);
      // If the room never got 3+ points, drop it entirely (no history entry —
      // an aborted draw shouldn't pollute undo).
      if (room && room.walls.length < 3) {
        set({
          document: { ...document, rooms: document.rooms.filter((r) => r.id !== activeRoomId) },
          activeRoomId: null,
          isDrawingWalls: false,
          selection: { type: "none" }
        });
        return;
      }
      set({ isDrawingWalls: false });
    },

    moveVertex: (roomId, index, point) => {
      batch("moveVertex", (doc) => updateVertex(doc, roomId, index, point));
    },

    deleteVertex: (roomId, index) => {
      batch("deleteVertex", (doc) => removeVertex(doc, roomId, index));
      set({ selection: { type: "none" } });
    },

    setActiveRoomWallThickness: (roomId, thickness) => {
      batch("setWallThickness", (doc) => setWallThickness(doc, roomId, thickness));
    },

    setActiveRoomHeight: (roomId, height) => {
      batch("setRoomHeight", (doc) => setRoomHeight(doc, roomId, height));
    },

    placeOpening: (roomId, type, wallIndex, position) => {
      const opening = createOpening(type, wallIndex, position);
      batch("placeOpening", (doc) => addOpening(doc, roomId, opening));
      set({ selection: { type: "opening", roomId, openingId: opening.id } });
      return opening.id;
    },

    moveOpening: (roomId, openingId, updates) => {
      batch("moveOpening", (doc) => updateOpening(doc, roomId, openingId, updates));
    },

    deleteOpening: (roomId, openingId) => {
      batch("deleteOpening", (doc) => removeOpening(doc, roomId, openingId));
      set({ selection: { type: "none" } });
    },

    addFurnitureItem: (catalogId, position) => {
      const catalogItem = getCatalogItem(catalogId);
      if (!catalogItem) return null;

      const { document } = get();
      // Default to the first room's centroid (world XZ) so new items land in
      // view; fall back to the origin when there are no rooms yet.
      let where: Vector3 = position ?? { x: 0, y: 0, z: 0 };
      if (!position) {
        const firstRoom = document.rooms[0];
        if (firstRoom && firstRoom.walls.length >= 3) {
          const c = polygonCentroid(firstRoom.walls);
          where = { x: c.x, y: 0, z: c.y };
        }
      }

      const item: FurnitureItem = {
        id: generateId("furn"),
        catalogId,
        position: { ...where, y: 0 },
        rotationY: 0,
        dimensions: { ...catalogItem.dimensions }
      };
      // Light-emitting catalog items (e.g. floor lamps) also get a lamp light,
      // added in the same edit so it is one undo step. `batch` diffs the
      // whole before/after document once, so chaining addFurniture +
      // addLampLight here costs nothing extra history-wise.
      const isLight = catalogItem.category === "lighting";
      batch("addFurniture", (doc) => {
        let next = addFurniture(doc, item);
        if (isLight) {
          next = addLampLight(next, createLampLight(generateId("lamp"), item.id));
        }
        return next;
      });
      set({ selection: { type: "furniture", itemId: item.id } });
      return item.id;
    },

    moveFurnitureItem: (itemId, updates) => {
      batch("moveFurniture", (doc) => moveFurniture(doc, itemId, updates));
    },

    rotateFurnitureItem: (itemId, rotationY) => {
      batch("rotateFurniture", (doc) => moveFurniture(doc, itemId, { rotationY }));
    },

    removeFurnitureItem: (itemId) => {
      // Batched: removing the item and its lamp light (if any) is one undo step.
      batch("removeFurniture", (doc) => removeLampLightsForFurniture(removeFurniture(doc, itemId), itemId));
      set((state) =>
        state.selection.type === "furniture" && state.selection.itemId === itemId
          ? { selection: { type: "none" } }
          : {}
      );
    },

    selectFurniture: (itemId) => set({ selection: { type: "furniture", itemId } }),

    setLightingQuality: (quality) => set({ lightingQuality: quality }),

    // Sun-slider edits coalesce: a run of transient updates captures the
    // pre-drag document once (`lightingTransientBase`), applying each
    // intermediate value to `document` without touching history; only the
    // committing (non-transient) call — or `commitSunLight` — diffs
    // `lightingTransientBase` straight to the final document and records a
    // single history entry for the whole drag. Since `lights` is a
    // same-length array (the sun light already exists), this diff lands on
    // the fine-grained per-index branch of `diffPatches`, not a whole-array
    // replace.
    setSunLight: (updates, opts) => {
      const { document, history, lightingTransientBase } = get();
      const next = coreSetSunLight(document, updates);
      if (opts?.transient) {
        set({ document: next, lightingTransientBase: lightingTransientBase ?? document });
      } else {
        const base = lightingTransientBase ?? document;
        const { doc, patches, inversePatches } = diffPatches(base, next);
        set({ document: doc, history: pushHistory(history, { patches, inversePatches, label: "setSunLight" }), lightingTransientBase: null });
      }
    },

    commitSunLight: () => {
      const { history, lightingTransientBase, document } = get();
      if (!lightingTransientBase) return;
      const { doc, patches, inversePatches } = diffPatches(lightingTransientBase, document);
      set({ document: doc, history: pushHistory(history, { patches, inversePatches, label: "commitSunLight" }), lightingTransientBase: null });
    },

    toggleLamp: (furnitureItemId, on) => {
      const { document } = get();
      const lamp = getLampForFurniture(document, furnitureItemId);
      if (!lamp) return;
      const nextOn = on ?? !lamp.on;
      batch("toggleLamp", (doc) => setLampOn(doc, lamp.id, nextOn));
    },

    select: (selection) => set({ selection }),

    // Undo/redo only ever push/pop the ends of `past`/`future` (never
    // reorder or splice into the middle), so each entry's patches are always
    // applied against exactly the document state they were captured
    // relative to.
    undo: () => {
      const { history, document } = get();
      const entry = history.past.at(-1);
      if (!entry) return;
      const previous = applyPatches(document, entry.inversePatches);
      set({
        document: previous,
        history: {
          past: history.past.slice(0, -1),
          future: [entry, ...history.future].slice(0, MAX_HISTORY)
        }
      });
    },

    redo: () => {
      const { history, document } = get();
      const entry = history.future[0];
      if (!entry) return;
      const next = applyPatches(document, entry.patches);
      set({
        document: next,
        history: {
          past: [...history.past, entry].slice(-MAX_HISTORY),
          future: history.future.slice(1)
        }
      });
    },

    canUndo: () => get().history.past.length > 0,
    canRedo: () => get().history.future.length > 0,

    batch,

    loadDocument: (doc) =>
      set({ document: ensureSunLight(doc), history: { past: [], future: [] }, selection: { type: "none" }, lightingTransientBase: null }),

    reset: () =>
      set({
        document: ensureSunLight(createEmptyDocument("Untitled design")),
        activeRoomId: null,
        selection: { type: "none" },
        isDrawingWalls: false,
        history: { past: [], future: [] },
        lightingTransientBase: null
      })
  };
});

/** Convenience selector for a room by id. */
export function selectRoom(state: SceneStoreState, roomId: string): Room | undefined {
  return state.document.rooms.find((r) => r.id === roomId);
}
