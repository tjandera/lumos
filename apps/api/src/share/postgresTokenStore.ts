import { randomBytes } from "node:crypto";
import type { PgPool } from "../db/pool.js";
import type { ShareTokenStore } from "./tokenStore.js";

/** Postgres-backed `ShareTokenStore` - one row per active token in `shares`. */
export class PostgresShareTokenStore implements ShareTokenStore {
  constructor(private readonly pool: PgPool) {}

  async createToken(designId: string): Promise<string> {
    // One active share link per design at a time - revoke any existing
    // token(s) for this design before issuing a fresh one.
    await this.pool.query("DELETE FROM shares WHERE design_id = $1", [designId]);
    // 24 bytes = 192 bits of entropy, base64url-encoded - unguessable.
    const token = randomBytes(24).toString("base64url");
    await this.pool.query("INSERT INTO shares (token, design_id) VALUES ($1, $2)", [token, designId]);
    return token;
  }

  async resolve(token: string): Promise<string | undefined> {
    const { rows } = await this.pool.query<{ design_id: string }>(
      "SELECT design_id FROM shares WHERE token = $1",
      [token]
    );
    return rows[0]?.design_id;
  }

  async revokeForDesign(designId: string): Promise<void> {
    await this.pool.query("DELETE FROM shares WHERE design_id = $1", [designId]);
  }
}
