/**
 * Design ownership map — kept entirely separate from the `SceneDocument` JSON
 * so ownership metadata (a session uid) never appears in a saved/loaded/shared
 * document payload. File-backed like `FileDesignStorage`, one JSON map file
 * (`owners.json`) in the data dir, atomic writes (temp file + rename).
 *
 * Migration-lite: designs written before this feature existed (or written
 * directly to a `DesignStorage` without going through the owned routes) have
 * no entry here. `designs/routes.ts` treats a missing owner as "unowned /
 * claimable by first PUT" rather than as an error.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface OwnershipStore {
  /** `undefined` if the design has never been claimed/created by anyone (legacy/unowned). */
  getOwner(designId: string): Promise<string | undefined>;
  setOwner(designId: string, ownerId: string): Promise<void>;
  deleteOwner(designId: string): Promise<void>;
}

export class FileOwnershipStore implements OwnershipStore {
  constructor(private readonly dataDir: string) {}

  private file(): string {
    return path.join(this.dataDir, "owners.json");
  }

  private async readAll(): Promise<Record<string, string>> {
    await mkdir(this.dataDir, { recursive: true });
    try {
      const raw = await readFile(this.file(), "utf-8");
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private async writeAll(map: Record<string, string>): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const tmp = path.join(this.dataDir, `.tmp-owners-${randomUUID()}.json`);
    await writeFile(tmp, JSON.stringify(map, null, 2), "utf-8");
    await rename(tmp, this.file());
  }

  async getOwner(designId: string): Promise<string | undefined> {
    const map = await this.readAll();
    return map[designId];
  }

  async setOwner(designId: string, ownerId: string): Promise<void> {
    const map = await this.readAll();
    map[designId] = ownerId;
    await this.writeAll(map);
  }

  async deleteOwner(designId: string): Promise<void> {
    const map = await this.readAll();
    if (!(designId in map)) return;
    delete map[designId];
    await this.writeAll(map);
  }
}
