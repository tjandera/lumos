/**
 * Postgres connection pooling + schema bootstrap for the Postgres-backed
 * storage adapters (`designs/postgresStorage.ts`,
 * `designs/postgresOwnershipStore.ts`, `share/postgresTokenStore.ts`).
 *
 * No migration framework - per the backlog scope this is a single idempotent
 * `CREATE TABLE IF NOT EXISTS` per table, run once at startup. If the schema
 * ever needs to evolve beyond additive `IF NOT EXISTS` tables, that's the
 * point to introduce a real migration tool.
 */
import pg from "pg";

const { Pool } = pg;
export type PgPool = InstanceType<typeof pg.Pool>;

/** Build a connection-pooled `pg.Pool` for `connectionString` (typically `process.env.DATABASE_URL`). */
export function createPgPool(connectionString: string): PgPool {
  return new Pool({ connectionString });
}

/**
 * Fail fast with a clear error if Postgres is unreachable, rather than
 * letting the first real request surface a confusing pool-connection error.
 * Call once at startup, right after `createPgPool`.
 */
export async function pingPgPool(pool: PgPool): Promise<void> {
  try {
    await pool.query("SELECT 1");
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not connect to Postgres (DATABASE_URL set, but the database is unreachable): ${cause}`
    );
  }
}

/**
 * Idempotently create the `designs`, `owners`, and `shares` tables if they
 * don't already exist. Safe to call on every startup / every test setup.
 */
export async function ensurePgSchema(pool: PgPool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS designs (
      id TEXT PRIMARY KEY,
      doc JSONB NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS owners (
      design_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shares (
      token TEXT PRIMARY KEY,
      design_id TEXT NOT NULL
    )
  `);
}
