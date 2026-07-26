import type { SceneDocument } from "@interior/core";

export interface DesignSummary {
  id: string;
  name: string;
  updatedAt: string;
}

/**
 * Storage abstraction for designs, kept intentionally small so the
 * file-backed implementation can later be swapped for a database-backed one
 * (e.g. Postgres) without touching route code.
 */
export interface DesignStorage {
  list(): Promise<DesignSummary[]>;
  get(id: string): Promise<SceneDocument | undefined>;
  save(doc: SceneDocument): Promise<void>;
  delete(id: string): Promise<boolean>;
}
