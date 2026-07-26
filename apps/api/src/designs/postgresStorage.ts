import type { SceneDocument } from "@interior/core";
import type { PgPool } from "../db/pool.js";
import type { DesignStorage, DesignSummary } from "./storage.js";

interface DesignRow {
  id: string;
  doc: SceneDocument;
  name: string;
  updated_at: Date | string;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Postgres-backed `DesignStorage`. The full `SceneDocument` is stored as
 * `jsonb` (`doc`) - the source of truth for `get()` - with `name`/
 * `created_at`/`updated_at` denormalized into their own columns purely so
 * `list()` can sort/filter cheaply without parsing jsonb. All queries are
 * parameterized; no string-built SQL.
 */
export class PostgresDesignStorage implements DesignStorage {
  constructor(private readonly pool: PgPool) {}

  async list(): Promise<DesignSummary[]> {
    const { rows } = await this.pool.query<{ id: string; name: string; updated_at: Date | string }>(
      "SELECT id, name, updated_at FROM designs ORDER BY updated_at DESC"
    );
    return rows.map((row) => ({ id: row.id, name: row.name, updatedAt: toIso(row.updated_at) }));
  }

  async get(id: string): Promise<SceneDocument | undefined> {
    const { rows } = await this.pool.query<DesignRow>("SELECT doc FROM designs WHERE id = $1", [id]);
    return rows[0]?.doc;
  }

  async save(doc: SceneDocument): Promise<void> {
    await this.pool.query(
      `INSERT INTO designs (id, doc, name, created_at, updated_at)
       VALUES ($1, $2::jsonb, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET doc = $2::jsonb, name = $3, updated_at = $5`,
      [doc.meta.id, JSON.stringify(doc), doc.meta.name, doc.meta.createdAt, doc.meta.updatedAt]
    );
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM designs WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }
}
