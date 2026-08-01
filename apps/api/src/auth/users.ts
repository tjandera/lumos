/**
 * User accounts.
 *
 * **Postgres only, deliberately.** Designs fall back to a per-pod JSON file when no
 * database is configured, and that is a reasonable trade for scene data. It is not a
 * reasonable trade for credentials: a file store means password hashes that don't survive
 * a redeploy, differ between replicas, and sit in a container's writable layer. When
 * there's no database, accounts report themselves unavailable and the app keeps working
 * exactly as it did before — anonymously.
 */
import { randomUUID } from "node:crypto";
import type { PgPool } from "../db/pool.js";

export interface User {
  id: string;
  email: string;
  createdAt: Date;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
}

export interface UserStore {
  findByEmail(email: string): Promise<{ user: User; passwordHash: string } | null>;
  findById(id: string): Promise<User | null>;
  /** `null` when the email is already taken — the caller turns that into a 409. */
  create(email: string, passwordHash: string): Promise<User | null>;
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
}

/**
 * Emails are compared case-insensitively and stored normalised.
 *
 * The local part is case-sensitive per RFC 5321, but no mail provider anyone will use
 * treats it that way, and honouring the spec here would let `Sam@x.com` and `sam@x.com`
 * register as two accounts — a confusing outcome and a mild account-takeover vector when
 * one of them is later used for a password reset.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Deliberately loose. Real validation of an email address is delivery, not a regex; the
 * only jobs here are catching obvious typos and bounding the length so a giant string
 * can't be pushed through to storage.
 */
export function emailProblem(email: string): string | null {
  const e = normaliseEmail(email);
  if (e.length === 0) return "Email is required.";
  if (e.length > 254) return "Email is too long.";
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(e)) return "That doesn't look like an email address.";
  return null;
}

const toUser = (row: UserRow): User => ({ id: row.id, email: row.email, createdAt: row.created_at });

export function createPostgresUserStore(pool: PgPool): UserStore {
  return {
    async findByEmail(email) {
      const { rows } = await pool.query<UserRow>(
        `SELECT id, email, password_hash, created_at FROM users WHERE email = $1`,
        [normaliseEmail(email)],
      );
      const row = rows[0];
      return row ? { user: toUser(row), passwordHash: row.password_hash } : null;
    },

    async findById(id) {
      const { rows } = await pool.query<UserRow>(
        `SELECT id, email, password_hash, created_at FROM users WHERE id = $1`,
        [id],
      );
      return rows[0] ? toUser(rows[0]) : null;
    },

    async create(email, passwordHash) {
      // `ON CONFLICT DO NOTHING` rather than reading first: a check-then-insert leaves a
      // window in which two simultaneous registrations for the same address both pass the
      // check. The UNIQUE constraint is the only thing that actually decides.
      const id = randomUUID();
      const normalised = normaliseEmail(email);
      await pool.query(
        `INSERT INTO users (id, email, password_hash, created_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (email) DO NOTHING`,
        [id, normalised, passwordHash],
      );

      // Then read back and check the row is *ours*.
      //
      // The obvious version of this uses `RETURNING` and treats "no rows" as a conflict.
      // That is correct on Postgres and wrong on pg-mem, which enforces the constraint
      // (no duplicate row is created) but still hands back a row from a `DO NOTHING`
      // insert — so the duplicate would have been reported as a successful signup, handing
      // one person a session pointing at someone else's account. Comparing the id makes
      // the check independent of that difference, at the cost of one cheap read that only
      // happens on registration.
      const { rows } = await pool.query<UserRow>(
        `SELECT id, email, password_hash, created_at FROM users WHERE email = $1`,
        [normalised],
      );
      const row = rows[0];
      return row && row.id === id ? toUser(row) : null;
    },

    async updatePasswordHash(id, passwordHash) {
      await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, id]);
    },
  };
}

/**
 * Owner ids for signed-in users are namespaced.
 *
 * The whole ownership layer keys off an opaque string, so a signed-in user is simply a
 * different value of that string — no changes to `OwnershipStore`, its Postgres and file
 * implementations, or any route that checks access. The prefix keeps a user id from ever
 * colliding with an anonymous session's UUID.
 */
export const USER_OWNER_PREFIX = "user:";

export const ownerIdForUser = (userId: string): string => `${USER_OWNER_PREFIX}${userId}`;

export const userIdFromOwnerId = (ownerId: string): string | null =>
  ownerId.startsWith(USER_OWNER_PREFIX) ? ownerId.slice(USER_OWNER_PREFIX.length) : null;

export const isAnonymousOwner = (ownerId: string): boolean => !ownerId.startsWith(USER_OWNER_PREFIX);
