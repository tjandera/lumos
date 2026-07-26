import { ZodError } from 'zod';
import {
  CURRENT_SCHEMA_VERSION,
  SceneDocumentSchema,
  DEFAULT_WALL_MATERIAL,
  DEFAULT_FLOOR_MATERIAL,
  DEFAULT_CEILING_MATERIAL,
  type SceneDocument,
} from './schema.js';

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

  // v3 -> v4: rooms gain `materials` (wall/floor/ceiling colour + finish). Defaults
  // match the colours that were previously hardcoded in the renderer, so migrated
  // documents render identically until the user changes something.
  3: (doc) => {
    const rest = doc as { rooms?: Array<Record<string, unknown>> };
    const rooms = (rest.rooms ?? []).map((r) => ({
      ...r,
      materials: r.materials ?? {
        wall: DEFAULT_WALL_MATERIAL,
        floor: DEFAULT_FLOOR_MATERIAL,
        ceiling: DEFAULT_CEILING_MATERIAL,
      },
    }));
    return { ...doc, schemaVersion: 4, rooms };
  },

  // v4 -> v5: openings gain `glassTint` (cosmetic) and `covering` (the actual
  // daylight control — open by default, so existing designs behave unchanged).
  4: (doc) => {
    const rest = doc as { openings?: Array<Record<string, unknown>> };
    const openings = (rest.openings ?? []).map((o) => ({
      ...o,
      glassTint: o.glassTint ?? 0.06,
      covering: o.covering ?? { type: 'none', state: 'open' },
    }));
    return { ...doc, schemaVersion: 5, openings };
  },

  // v5 -> v6: identity moves off the document root into a `meta` block that also carries
  // created/updated timestamps, so the designs API has something to list and sort on.
  5: (doc) => {
    const { id, name, ...rest } = doc as { id?: unknown; name?: unknown };
    const now = new Date().toISOString();
    return {
      ...rest,
      schemaVersion: 6,
      meta: {
        id: typeof id === 'string' ? id : randomId(),
        name: typeof name === 'string' ? name : 'Untitled design',
        // Unknowable for a pre-v6 document; "now" is the honest answer for both.
        createdAt: now,
        updatedAt: now,
      },
    };
  },
};

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Two independent codebases were merged into this one, and they both versioned their
 * documents from 1 — so `schemaVersion: 2` is ambiguous on its own. Tell the lineages
 * apart by *shape* instead:
 *
 * - This codebase's rooms hold wall SEGMENTS (`{ start, end, thickness, height }`) and
 *   keep openings in a top-level array keyed by `wallId`.
 * - The other lineage's rooms hold a closed POLYLINE of corner points (`{ x, y }`), with
 *   thickness/height on the room and openings nested inside it keyed by `wallIndex`.
 *
 * Anything that isn't recognisably polyline-shaped is treated as this lineage, which is
 * the safe default: the version-keyed migrator chain will reject it if it's neither.
 */
/** The highest schemaVersion the polyline lineage ever shipped, before the merge. */
const POLYLINE_LINEAGE_MAX_VERSION = 2;

function isPolylineLineage(doc: Record<string, unknown>): boolean {
  // Strongest signal: a room whose walls are corner points rather than segments.
  const rooms = doc.rooms;
  if (Array.isArray(rooms) && rooms.length > 0) {
    const room = rooms[0] as Record<string, unknown> | undefined;
    const wall = Array.isArray(room?.walls) ? (room.walls[0] as Record<string, unknown> | undefined) : undefined;
    if (wall) return 'x' in wall && 'y' in wall && !('start' in wall);
    // A room with no walls still identifies itself by where it keeps its openings.
    if (room && ('openings' in room || 'wallThickness' in room)) return true;
  }

  // An empty or room-less document still has tells: their lights are a tagged
  // sun|lamp union, and their identity always lived in `meta` while ours (pre-v6) kept
  // id/name on the root and always carried a top-level `openings` array.
  const lights = doc.lights;
  if (Array.isArray(lights) && lights.some((l) => typeof (l as { type?: unknown })?.type === 'string')) {
    return true;
  }
  return typeof doc.meta === 'object' && doc.meta !== null && !Array.isArray(doc.openings);
}

/**
 * Convert a polyline-lineage document into this lineage's shape (pre-`meta`, so the
 * normal v5 -> v6 migrator finishes the job). Corner points become explicit wall
 * segments, which is lossless in that direction — the reverse would not be, since
 * segments can carry per-wall thickness and height that a single room-level value can't.
 */
function fromPolylineLineage(doc: Record<string, unknown>): Record<string, unknown> {
  const rooms = (doc.rooms ?? []) as Array<Record<string, unknown>>;
  const allOpenings: Array<Record<string, unknown>> = [];

  const converted = rooms.map((room) => {
    const pts = (room.walls ?? []) as Array<{ x: number; y: number }>;
    const thickness = typeof room.wallThickness === 'number' ? room.wallThickness : 0.12;
    const height = typeof room.height === 'number' ? room.height : 2.7;
    const roomId = typeof room.id === 'string' ? room.id : randomId();

    // Close the polyline: segment i runs from pts[i] to pts[i+1], last wraps to pts[0].
    // Their plan plane is x/y; ours is x/z (y is up here) — see units.ts.
    const walls = pts.map((p, i) => {
      const next = pts[(i + 1) % pts.length]!;
      return {
        id: `${roomId}-w${i}`,
        start: { x: p.x, z: p.y },
        end: { x: next.x, z: next.y },
        thickness,
        height,
      };
    });

    for (const o of (room.openings ?? []) as Array<Record<string, unknown>>) {
      const idx = typeof o.wallIndex === 'number' ? o.wallIndex : 0;
      const host = walls[idx] ?? walls[0];
      if (!host) continue;
      allOpenings.push({
        id: typeof o.id === 'string' ? o.id : randomId(),
        wallId: host.id,
        kind: o.type === 'door' ? 'door' : 'window',
        offset: typeof o.position === 'number' ? o.position : 0,
        width: typeof o.width === 'number' ? o.width : 1,
        height: typeof o.height === 'number' ? o.height : 1.2,
        sillHeight: typeof o.sillHeight === 'number' ? o.sillHeight : 0.9,
      });
    }

    return { id: roomId, name: room.name ?? 'Room', walls };
  });

  // Their lights are a sun|lamp union. The sun isn't a fixture here — it's derived from
  // `site` + `view.timeOfDay` — so it's folded into those and dropped from `lights`.
  const lights = (doc.lights ?? []) as Array<Record<string, unknown>>;
  const sun = lights.find((l) => l.type === 'sun');
  const lamps = lights
    .filter((l) => l.type === 'lamp')
    .map((l) => ({
      id: typeof l.id === 'string' ? l.id : randomId(),
      kind: 'table',
      position: { x: 0, y: 0.9, z: 0 }, // refined below if the host furniture is found
      intensityCandela: typeof l.intensity === 'number' ? l.intensity : 120,
      color: typeof l.color === 'string' ? l.color : '#ffe6b0',
      on: l.on !== false,
      furnitureItemId: typeof l.furnitureItemId === 'string' ? l.furnitureItemId : undefined,
    }));

  const furniture = ((doc.furniture ?? []) as Array<Record<string, unknown>>).map((f) => ({
    id: f.id,
    catalogId: f.catalogId,
    position: f.position,
    rotationY: f.rotationY,
    dimensions: f.dimensions,
  }));

  // Put each lamp where its host furniture actually is.
  for (const lamp of lamps) {
    const host = furniture.find((f) => f.id === lamp.furnitureItemId);
    const pos = host?.position as { x: number; z: number } | undefined;
    if (pos) lamp.position = { x: pos.x, y: 0.9, z: pos.z };
  }

  const meta = (doc.meta ?? {}) as Record<string, unknown>;
  const site = (doc.site ?? {}) as Record<string, unknown>;

  return {
    // Pre-`meta` shape on purpose: hand back to the v5 -> v6 migrator to finish.
    schemaVersion: 5,
    id: meta.id,
    name: meta.name,
    // Their earliest documents had no `site` block at all — siting lived on the sun
    // light, whose `northOffset` was in RADIANS (this schema stores degrees).
    site: {
      lat: typeof site.lat === 'number' ? site.lat : numberOr(sun?.latitude, 0),
      lng: typeof site.lng === 'number' ? site.lng : numberOr(sun?.longitude, 0),
      trueNorthOffsetDeg:
        typeof site.trueNorthOffsetDeg === 'number'
          ? site.trueNorthOffsetDeg
          : (numberOr(sun?.northOffset, 0) * 180) / Math.PI,
    },
    rooms: converted,
    openings: allOpenings,
    furniture,
    lights: lamps,
    view: {
      timeOfDay: sunToIso(sun),
      camera: { position: { x: 5.5, y: 4.5, z: 5.5 }, target: { x: 0, y: 1, z: 0 } },
    },
  };
}

/** Their sun config carries `date` + `time` as separate strings; ours is one ISO stamp. */
function sunToIso(sun: Record<string, unknown> | undefined): string {
  const date = typeof sun?.date === 'string' && sun.date ? sun.date : '2026-06-21';
  const time = typeof sun?.time === 'string' && sun.time ? sun.time : '16:00';
  return `${date}T${time.length === 5 ? `${time}:00` : time}`;
}

/** Thrown when input can't be migrated to, or validated as, a current document. */
export class MigrationError extends Error {
  /** Structured detail — zod's formatted error, or a short reason string. */
  readonly details: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'MigrationError';
    this.details = details;
    // Preserve the prototype chain when compiled down for older targets.
    Object.setPrototypeOf(this, MigrationError.prototype);
  }
}

/**
 * Upgrade any historical document to the current schema, then validate it.
 * Throws if the document is unrecognizable, has no migration path, or was written
 * by a newer app version than we understand.
 */
export function migrateSceneDocument(input: unknown): SceneDocument {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Not a scene document');
  }
  let doc = input as Record<string, unknown>;
  // A missing version means version 1: the other lineage saved documents before it had
  // versioning at all, and those are exactly the ones most in need of migrating.
  const rawVersion = doc.schemaVersion === undefined ? 1 : doc.schemaVersion;
  if (typeof rawVersion !== 'number') {
    throw new Error('Invalid scene document: schemaVersion must be a number');
  }
  // Documents from the other merged codebase are converted into this lineage's shape
  // first; from there the ordinary version-keyed chain takes over. The "too new to
  // understand" guard has to run against the version as *written*, and against that
  // lineage's own ceiling — after conversion the number means something different.
  const polyline = isPolylineLineage(doc);
  const ceiling = polyline ? POLYLINE_LINEAGE_MAX_VERSION : CURRENT_SCHEMA_VERSION;
  if (rawVersion > ceiling) {
    throw new Error(
      `Document schemaVersion ${rawVersion} is newer than supported ${ceiling}. Update the app.`,
    );
  }
  if (polyline) {
    doc = fromPolylineLineage(doc);
  }
  let version: number = doc.schemaVersion as number;
  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = migrators[version];
    if (!migrate) throw new Error(`No migrator registered from schemaVersion ${version}`);
    doc = migrate(doc);
    version = doc.schemaVersion as number;
  }
  return SceneDocumentSchema.parse(doc);
}

/**
 * Same as `migrateSceneDocument`, but every failure surfaces as a `MigrationError`
 * carrying structured `details` — which is what the API's request validation wants, so
 * it can turn a bad payload into a 400 with a useful body instead of a bare 500.
 */
export function migrate(input: unknown): SceneDocument {
  try {
    return migrateSceneDocument(input);
  } catch (err) {
    if (err instanceof MigrationError) throw err;
    if (err instanceof ZodError) {
      throw new MigrationError('Document failed schema validation', err.format());
    }
    throw new MigrationError(err instanceof Error ? err.message : 'Could not migrate document', err);
  }
}
