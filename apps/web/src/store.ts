import { create } from 'zustand';
import { History, sampleScene, type SceneDocument } from '@interior/core';
import { loadScene, saveScene, clearScene } from './persistence';

interface SceneStore {
  doc: SceneDocument;
  canUndo: boolean;
  canRedo: boolean;
  /** Apply an edit as one undoable patch batch (and persist it). */
  edit: (recipe: (draft: SceneDocument) => void) => void;
  undo: () => void;
  redo: () => void;
  /** Discard the saved design and return to the sample scene. */
  reset: () => void;
}

// The document lives in a patch-based History, seeded from localStorage; the store
// mirrors it for React and autosaves on every change.
let history = new History<SceneDocument>(loadScene());

export const useSceneStore = create<SceneStore>()((set) => {
  const sync = () => {
    saveScene(history.current);
    set({ doc: history.current, canUndo: history.canUndo(), canRedo: history.canRedo() });
  };
  return {
    doc: history.current,
    canUndo: history.canUndo(),
    canRedo: history.canRedo(),
    edit: (recipe) => {
      history.update(recipe);
      sync();
    },
    undo: () => {
      history.undo();
      sync();
    },
    redo: () => {
      history.redo();
      sync();
    },
    reset: () => {
      clearScene();
      history = new History<SceneDocument>(sampleScene);
      sync();
    },
  };
});
