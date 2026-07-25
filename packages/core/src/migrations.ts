import { CURRENT_SCHEMA_VERSION, SceneDocumentSchema, type SceneDocument } from './schema';

type Migrator = (doc: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migrators keyed by the version they upgrade FROM. `migrators[1]` takes a v1
 * document and returns a v2 document. Add a new entry each time
 * CURRENT_SCHEMA_VERSION is bumped — never mutate an existing one.
 */
const migrators: Record<number, Migrator> = {
  // v1 -> v2: v1 stored geographic position as `location: { lat, lng }` and had no
  // north offset. v2 renames it to `site` and adds `trueNorthOffsetDeg` (default 0).
  1: (doc) => {
    const { location, ...rest } = doc as { location?: { lat?: number; lng?: number } };
    return {
      ...rest,
      schemaVersion: 2,
      site: {
        lat: location?.lat ?? 0,
        lng: location?.lng ?? 0,
        trueNorthOffsetDeg: 0,
      },
    };
  },

  // v2 -> v3: lights gain a fixture `kind` (mount + model), `kelvin` (colour
  // temperature, kept in sync with the existing `color` hex), `on`, and `castShadow`/
  // `auto`. Every v2 light was rendered as a small warm table lamp, so that's the
  // safe default. The document also gains `lightingScenes` (saved presets), empty.
  2: (doc) => {
    const rest = doc as { lights?: Array<Record<string, unknown>> };
    const lights = (rest.lights ?? []).map((l) => ({
      ...l, // preserve id/position/intensityCandela/color as-is
      kind: 'table', // v2's `kind` was always the literal 'lamp' — not a valid v3 FixtureKind
      kelvin: (l.kelvin as number | undefined) ?? 2700,
      on: (l.on as boolean | undefined) ?? true,
      castShadow: (l.castShadow as boolean | undefined) ?? true,
      auto: (l.auto as boolean | undefined) ?? false,
    }));
    return { ...doc, schemaVersion: 3, lights, lightingScenes: [] };
  },
};

/**
 * Upgrade any historical document to the current schema, then validate it.
 * Throws if the document is unrecognizable, has no migration path, or was written
 * by a newer app version than we understand.
 */
export function migrateSceneDocument(input: unknown): SceneDocument {
  if (typeof input !== 'object' || input === null || !('schemaVersion' in input)) {
    throw new Error('Not a scene document: missing schemaVersion');
  }
  let doc = input as Record<string, unknown>;
  const rawVersion = doc.schemaVersion;
  if (typeof rawVersion !== 'number') {
    throw new Error('Invalid scene document: schemaVersion must be a number');
  }
  let version: number = rawVersion;
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Document schemaVersion ${version} is newer than supported ${CURRENT_SCHEMA_VERSION}. Update the app.`,
    );
  }
  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = migrators[version];
    if (!migrate) throw new Error(`No migrator registered from schemaVersion ${version}`);
    doc = migrate(doc);
    version = doc.schemaVersion as number;
  }
  return SceneDocumentSchema.parse(doc);
}
