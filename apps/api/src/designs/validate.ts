import { MigrationError, coarsenDocumentForSharing, migrate, type SceneDocument } from "@interior/core";

/**
 * Design-document validation for the API. This is a thin wrapper over
 * `@interior/core`'s zod schema + migration harness — the schema in core is the
 * single source of truth. We accept either a v1 (unversioned) or v2 document,
 * migrate it to the current version, and validate the result; storage always
 * holds current-version (v2) documents.
 *
 * Replaces the previous hand-rolled structural checks (which could drift from
 * the core types and gave weaker guarantees).
 */
export type MigrateResult =
  | { ok: true; doc: SceneDocument }
  | { ok: false; errors: string[] };

/**
 * Validate, migrate, and **coarsen** a request body into a current-version
 * `SceneDocument`.
 *
 * The coarsening is the security-relevant part. `CLAUDE.md`'s rule is that only coarse
 * coordinates ever travel with a design, and the web client did honour it — but it was
 * the *only* thing honouring it. A precise `site` posted by anything else (curl, a future
 * client, a bug) was stored verbatim and then served to anyone holding the share token.
 * A privacy guarantee enforced solely in the client is not a guarantee, so the server now
 * enforces it on the way in, where it cannot be bypassed.
 *
 * Returns `{ ok: true, doc }` with the migrated document, or `{ ok: false }`
 * with human-readable error strings when the body is not a valid design.
 */
export function migrateSceneDocument(body: unknown): MigrateResult {
  try {
    return { ok: true, doc: coarsenDocumentForSharing(migrate(body)) };
  } catch (err) {
    if (err instanceof MigrationError) {
      return { ok: false, errors: [err.message] };
    }
    throw err;
  }
}
