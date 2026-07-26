/**
 * Share tokens — unguessable, revocable, independent of both auth (no cookie
 * required to resolve one) and the design document itself (a token is never
 * embedded in the `SceneDocument` JSON). File-backed (`shares.json` in the
 * data dir), same atomic-write pattern as `FileDesignStorage`.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ShareTokenStore {
  /**
   * Issue a fresh unguessable token for a design, revoking any previously
   * issued token(s) for that design first — one active share link per design
   * at a time, matching the "Share" button's create-or-replace UX.
   */
  createToken(designId: string): Promise<string>;
  /** Resolve a token to its design id, or `undefined` if unknown/revoked. */
  resolve(token: string): Promise<string | undefined>;
  /** Revoke all active tokens for a design (no-op if none exist). */
  revokeForDesign(designId: string): Promise<void>;
}

interface ShareData {
  /** token -> designId */
  tokens: Record<string, string>;
}

export class FileShareTokenStore implements ShareTokenStore {
  constructor(private readonly dataDir: string) {}

  private file(): string {
    return path.join(this.dataDir, "shares.json");
  }

  private async readAll(): Promise<ShareData> {
    await mkdir(this.dataDir, { recursive: true });
    try {
      const raw = await readFile(this.file(), "utf-8");
      const parsed = JSON.parse(raw) as Partial<ShareData>;
      return { tokens: parsed.tokens ?? {} };
    } catch {
      return { tokens: {} };
    }
  }

  private async writeAll(data: ShareData): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const tmp = path.join(this.dataDir, `.tmp-shares-${randomUUID()}.json`);
    await writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
    await rename(tmp, this.file());
  }

  async createToken(designId: string): Promise<string> {
    const data = await this.readAll();
    for (const [token, id] of Object.entries(data.tokens)) {
      if (id === designId) delete data.tokens[token];
    }
    // 24 bytes = 192 bits of entropy, base64url-encoded - unguessable.
    const token = randomBytes(24).toString("base64url");
    data.tokens[token] = designId;
    await this.writeAll(data);
    return token;
  }

  async resolve(token: string): Promise<string | undefined> {
    const data = await this.readAll();
    return data.tokens[token];
  }

  async revokeForDesign(designId: string): Promise<void> {
    const data = await this.readAll();
    let changed = false;
    for (const [token, id] of Object.entries(data.tokens)) {
      if (id === designId) {
        delete data.tokens[token];
        changed = true;
      }
    }
    if (changed) await this.writeAll(data);
  }
}
