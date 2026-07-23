/**
 * Migration harness for scene documents. Saved and shared designs must survive
 * schema evolution, so every persisted document is run through `migrate()`
 * before it is trusted: stepwise upgrades bring any older version up to
 * `CURRENT_SCHEMA_VERSION`, then the result is validated against the zod schema.
 *
 * Design:
 *   - Documents with no `schemaVersion` are version 1 (pre-versioning).
 *   - `MIGRATIONS[n]` upgrades a version-`n` document to version `n + 1`.
 *   - Migrations are applied in sequence until the document reaches the current
 *     version, then validated once at the end (so a bug in a step surfaces as a
 *     typed `MigrationError` rather than corrupt storage).
 *
 * NodeNext note: relative imports carry an explicit `.js` extension.
 */

import { sceneDocumentSchema } from "./schema.js";
import { CURRENT_SCHEMA_VERSION, type SceneDocument, type Site } from "./types.js";

/** Default siting for documents that have no sun light to derive one from. */
export const DEFAULT_SITE: Site = { lat: 51.5074, lng: -0.1278, trueNorthOffsetDeg: 0 };

function radToDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}

/** Error thrown when input cannot be migrated to / validated as a current document. */
export class MigrationError extends Error {
  /** Structured validation details (zod's formatted error, or a short reason). */
  readonly details: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "MigrationError";
    this.details = details;
    // Preserve prototype chain when compiled down for older targets.
    Object.setPrototypeOf(this, MigrationError.prototype);
  }
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read a document's version, treating a missing `schemaVersion` as version 1. */
function documentVersion(doc: UnknownRecord): number {
  const v = doc.schemaVersion;
  return typeof v === "number" && Number.isFinite(v) ? v : 1;
}

/**
 * v1 -> v2: introduce `schemaVersion` and the `site` block. `site` consolidates
 * the coarse location that previously lived only on the sun light config
 * (latitude/longitude + northOffset in radians -> trueNorthOffsetDeg). The sun
 * config fields are left intact (they remain the renderer's source of truth for
 * sun position); `site` is the canonical, address-free siting going forward.
 */
function migrateV1toV2(doc: UnknownRecord): UnknownRecord {
  const lights = Array.isArray(doc.lights) ? doc.lights : [];
  const sun = lights.find((l): l is UnknownRecord => isRecord(l) && l.type === "sun");

  const site: Site =
    sun && typeof sun.latitude === "number" && typeof sun.longitude === "number"
      ? {
          lat: sun.latitude,
          lng: sun.longitude,
          trueNorthOffsetDeg: typeof sun.northOffset === "number" ? radToDeg(sun.northOffset) : 0
        }
      : { ...DEFAULT_SITE };

  return { ...doc, schemaVersion: 2, site };
}

/** `MIGRATIONS[n]` upgrades a version-`n` document to version `n + 1`. */
const MIGRATIONS: Record<number, (doc: UnknownRecord) => UnknownRecord> = {
  1: migrateV1toV2
};

/**
 * Migrate an arbitrary input to a validated, current-version `SceneDocument`.
 *
 * Accepts a v1 (unversioned) or v2 document. Applies stepwise migrations to the
 * current version, then validates against the zod schema. Throws
 * `MigrationError` (with details) if the input is not an object, if no
 * migration path exists for its version, or if the migrated result fails
 * validation.
 */
export function migrate(input: unknown): SceneDocument {
  if (!isRecord(input)) {
    throw new MigrationError("Document must be a plain object", { received: typeof input });
  }

  let doc: UnknownRecord = input;
  let version = documentVersion(doc);
  let guard = 0;

  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      throw new MigrationError(`No migration registered from schema version ${version}`, { version });
    }
    doc = step(doc);
    const next = documentVersion(doc);
    if (next <= version || ++guard > 100) {
      throw new MigrationError(`Migration from version ${version} did not advance the schema version`, {
        version,
        next
      });
    }
    version = next;
  }

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new MigrationError(
      `Document schema version ${version} is newer than supported version ${CURRENT_SCHEMA_VERSION}`,
      { version, current: CURRENT_SCHEMA_VERSION }
    );
  }

  const parsed = sceneDocumentSchema.safeParse(doc);
  if (!parsed.success) {
    throw new MigrationError("Migrated document failed schema validation", parsed.error.format());
  }
  return parsed.data;
}
