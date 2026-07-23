/**
 * Design management (save/open/new) state, kept separate from `sceneStore`
 * so the parallel lighting work in `sceneStore.ts` never conflicts with this
 * file. Talks to the API only through `../api/client`; the actual scene
 * content lives in `sceneStore` and is read/replaced via its existing
 * `document` state and `loadDocument` action — no new sceneStore surface
 * needed here.
 *
 * Dirty tracking: this store remembers the exact `SceneDocument` reference
 * (`lastSyncedDocument`) and name (`lastSyncedName`) as of the last
 * load/save, and subscribes to `sceneStore` so any *new* document reference
 * (i.e. any edit — sceneStore always replaces the document immutably) flips
 * `dirty` to true. Renaming via `setName` does the same. This intentionally
 * does not touch `sceneStore` — `save()` decorates a copy of the current
 * document with the current name rather than calling `loadDocument`, so a
 * save never wipes the undo/redo history. `newDesign()` / `open()` *do* call
 * `loadDocument` — starting fresh or switching designs is exactly the case
 * where resetting undo history is expected.
 */
import { create } from "zustand";
import type { SceneDocument } from "@interior/core";
import { createEmptyDocument } from "@interior/core";
import {
  checkHealth,
  createDesign,
  deleteDesign as apiDeleteDesign,
  getDesign,
  isNetworkError,
  listDesigns as apiListDesigns,
  saveDesign as apiSaveDesign,
  type DesignSummary
} from "../api/client";
import { useSceneStore } from "../store/sceneStore";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface DesignStoreState {
  /** Server-assigned id once saved at least once; `null` for a never-saved design. */
  id: string | null;
  name: string;
  dirty: boolean;
  saveStatus: SaveStatus;
  saveError: string | null;

  /** `null` = not yet checked; `true`/`false` = last known reachability. */
  apiOnline: boolean | null;

  designs: DesignSummary[];
  designsLoading: boolean;
  designsError: string | null;

  /** Internal: document/name as of the last successful load or save, for dirty comparison. */
  lastSyncedDocument: SceneDocument | null;
  lastSyncedName: string;

  setName: (name: string) => void;
  checkApiHealth: () => Promise<boolean>;

  /**
   * Start a fresh empty design. If there are unsaved changes, asks
   * `confirmFn` first (defaults to `window.confirm`, injectable for tests).
   * Returns whether it actually proceeded.
   */
  newDesign: (confirmFn?: (message: string) => boolean) => boolean;

  /** Save (POST if never saved, PUT thereafter). Returns whether it succeeded. */
  save: () => Promise<boolean>;

  /** Load a design by id into the scene (replaces the current document). Returns whether it succeeded. */
  open: (id: string) => Promise<boolean>;

  /** Refresh the `designs` list (for the Open dialog). */
  refreshDesigns: () => Promise<void>;

  /** Delete a design by id. Also clears local state if it was the currently-open design. */
  removeDesign: (id: string) => Promise<boolean>;
}

function defaultConfirm(message: string): boolean {
  return typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm(message) : true;
}

export const useDesignStore = create<DesignStoreState>((set, get) => ({
  id: null,
  name: "Untitled design",
  dirty: false,
  saveStatus: "idle",
  saveError: null,
  apiOnline: null,
  designs: [],
  designsLoading: false,
  designsError: null,
  lastSyncedDocument: useSceneStore.getState().document,
  lastSyncedName: useSceneStore.getState().document.meta.name,

  setName: (name) => {
    set((state) => ({ name, dirty: state.dirty || name !== state.lastSyncedName }));
  },

  checkApiHealth: async () => {
    const online = await checkHealth();
    set({ apiOnline: online });
    return online;
  },

  newDesign: (confirmFn = defaultConfirm) => {
    if (get().dirty) {
      const ok = confirmFn("You have unsaved changes. Start a new design and discard them?");
      if (!ok) return false;
    }
    const doc = createEmptyDocument("Untitled design");
    useSceneStore.getState().loadDocument(doc);
    set({
      id: null,
      name: doc.meta.name,
      dirty: false,
      saveStatus: "idle",
      saveError: null,
      lastSyncedDocument: doc,
      lastSyncedName: doc.meta.name
    });
    return true;
  },

  save: async () => {
    const { id, name } = get();
    const currentDoc = useSceneStore.getState().document;
    const payload: SceneDocument = { ...currentDoc, meta: { ...currentDoc.meta, name } };

    set({ saveStatus: "saving", saveError: null });
    try {
      const saved = id ? await apiSaveDesign(id, payload) : await createDesign(payload);
      set({
        id: saved.meta.id,
        name: saved.meta.name,
        dirty: false,
        saveStatus: "saved",
        saveError: null,
        apiOnline: true,
        lastSyncedDocument: currentDoc,
        lastSyncedName: saved.meta.name
      });
      return true;
    } catch (err) {
      set({
        saveStatus: "error",
        saveError: err instanceof Error ? err.message : "Save failed",
        apiOnline: isNetworkError(err) ? false : true
      });
      return false;
    }
  },

  open: async (designId) => {
    set({ saveStatus: "saving", saveError: null });
    try {
      const doc = await getDesign(designId);
      useSceneStore.getState().loadDocument(doc);
      set({
        id: doc.meta.id,
        name: doc.meta.name,
        dirty: false,
        saveStatus: "idle",
        saveError: null,
        apiOnline: true,
        lastSyncedDocument: doc,
        lastSyncedName: doc.meta.name
      });
      return true;
    } catch (err) {
      set({
        saveStatus: "error",
        saveError: err instanceof Error ? err.message : "Open failed",
        apiOnline: isNetworkError(err) ? false : true
      });
      return false;
    }
  },

  refreshDesigns: async () => {
    set({ designsLoading: true, designsError: null });
    try {
      const designs = await apiListDesigns();
      set({ designs, designsLoading: false, apiOnline: true });
    } catch (err) {
      set({
        designsLoading: false,
        designsError: err instanceof Error ? err.message : "Failed to list designs",
        apiOnline: isNetworkError(err) ? false : true
      });
    }
  },

  removeDesign: async (designId) => {
    try {
      await apiDeleteDesign(designId);
      set((state) => ({
        designs: state.designs.filter((d) => d.id !== designId),
        apiOnline: true,
        ...(state.id === designId ? { id: null } : {})
      }));
      return true;
    } catch (err) {
      set({
        designsError: err instanceof Error ? err.message : "Failed to delete design",
        apiOnline: isNetworkError(err) ? false : true
      });
      return false;
    }
  }
}));

// Any time sceneStore's document reference changes to something other than
// what we last synced, the design has unsaved changes. sceneStore always
// replaces `document` immutably on edit (see `applyEdit`/`loadDocument`), so
// reference inequality is a reliable "something changed" signal without
// needing sceneStore to know designStore exists.
useSceneStore.subscribe((state) => {
  const ds = useDesignStore.getState();
  if (state.document !== ds.lastSyncedDocument && !ds.dirty) {
    useDesignStore.setState({ dirty: true });
  }
});

export type { DesignSummary };
