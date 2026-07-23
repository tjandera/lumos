import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SceneDocument } from "@interior/core";
import type { DesignStorage, DesignSummary } from "./storage.js";

/** Reject ids that would escape the data directory via path traversal. */
function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id);
}

function fileFor(dir: string, id: string): string {
  return path.join(dir, `${id}.json`);
}

/**
 * File-backed design storage: one JSON file per design in `dataDir`, one
 * design per file. Writes are atomic (write to a temp file, then rename)
 * so a crash mid-write never leaves a corrupt/partial design file.
 */
export class FileDesignStorage implements DesignStorage {
  constructor(private readonly dataDir: string) {}

  private async ensureDir(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
  }

  async list(): Promise<DesignSummary[]> {
    await this.ensureDir();
    const files = await readdir(this.dataDir);
    const summaries: DesignSummary[] = [];

    for (const file of files) {
      if (!file.endsWith(".json") || file.includes(".tmp-")) continue;
      try {
        const raw = await readFile(path.join(this.dataDir, file), "utf-8");
        const doc = JSON.parse(raw) as SceneDocument;
        summaries.push({ id: doc.meta.id, name: doc.meta.name, updatedAt: doc.meta.updatedAt });
      } catch {
        // Skip unreadable/corrupt files rather than failing the whole list.
      }
    }

    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<SceneDocument | undefined> {
    if (!isSafeId(id)) return undefined;
    await this.ensureDir();
    try {
      const raw = await readFile(fileFor(this.dataDir, id), "utf-8");
      return JSON.parse(raw) as SceneDocument;
    } catch {
      return undefined;
    }
  }

  async save(doc: SceneDocument): Promise<void> {
    if (!isSafeId(doc.meta.id)) {
      throw new Error(`Invalid design id "${doc.meta.id}"`);
    }
    await this.ensureDir();
    const target = fileFor(this.dataDir, doc.meta.id);
    const tmp = path.join(this.dataDir, `.tmp-${doc.meta.id}-${randomUUID()}.json`);
    await writeFile(tmp, JSON.stringify(doc, null, 2), "utf-8");
    await rename(tmp, target);
  }

  async delete(id: string): Promise<boolean> {
    if (!isSafeId(id)) return false;
    await this.ensureDir();
    try {
      await rm(fileFor(this.dataDir, id));
      return true;
    } catch {
      return false;
    }
  }
}
