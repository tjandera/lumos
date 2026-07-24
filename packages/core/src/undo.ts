import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';

enablePatches();

interface HistoryEntry {
  patches: Patch[];
  inverse: Patch[];
}

/**
 * Command / patch-based undo history. Each `update` records the forward patches
 * and their inverse, so undo/redo cost is proportional to the size of the *edit*,
 * not the whole document. This composes cleanly with multi-step (e.g. AI) edits:
 * a batch of mutations in one `update` is a single undo step.
 */
export class History<T> {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  constructor(private state: T) {}

  get current(): T {
    return this.state;
  }

  /** Apply a mutation; no-op edits (no patches produced) are ignored. */
  update(recipe: (draft: T) => void): T {
    const [next, patches, inverse] = produceWithPatches(this.state, recipe);
    if (patches.length === 0) return this.state;
    this.state = next as T;
    this.undoStack.push({ patches, inverse });
    this.redoStack = [];
    return this.state;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): T {
    const entry = this.undoStack.pop();
    if (!entry) return this.state;
    // immer's applyPatches constrains its base to Objectish; History is generic over
    // document-like state, so we cast at this boundary (patches are structural).
    this.state = applyPatches(this.state as Parameters<typeof applyPatches>[0], entry.inverse) as T;
    this.redoStack.push(entry);
    return this.state;
  }

  redo(): T {
    const entry = this.redoStack.pop();
    if (!entry) return this.state;
    this.state = applyPatches(this.state as Parameters<typeof applyPatches>[0], entry.patches) as T;
    this.undoStack.push(entry);
    return this.state;
  }
}
