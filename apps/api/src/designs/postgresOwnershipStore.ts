import type { PgPool } from "../db/pool.js";
import type { OwnershipStore } from "./ownership.js";

/** Postgres-backed `OwnershipStore` - one row per claimed design in `owners`. */
export class PostgresOwnershipStore implements OwnershipStore {
  constructor(private readonly pool: PgPool) {}

  async getOwner(designId: string): Promise<string | undefined> {
    const { rows } = await this.pool.query<{ owner_id: string }>(
      "SELECT owner_id FROM owners WHERE design_id = $1",
      [designId]
    );
    return rows[0]?.owner_id;
  }

  async setOwner(designId: string, ownerId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO owners (design_id, owner_id)
       VALUES ($1, $2)
       ON CONFLICT (design_id) DO UPDATE SET owner_id = $2`,
      [designId, ownerId]
    );
  }

  async deleteOwner(designId: string): Promise<void> {
    await this.pool.query("DELETE FROM owners WHERE design_id = $1", [designId]);
  }
}
