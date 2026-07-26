import { z } from 'zod';
import {
  CURRENT_SCHEMA_VERSION,
  FixtureKindSchema,
  DEFAULT_WALL_MATERIAL,
  DEFAULT_FLOOR_MATERIAL,
  DEFAULT_CEILING_MATERIAL,
  type SceneDocument,
  type Opening,
  type FurnitureInstance,
  type LightInstance,
  type Finish,
} from './schema';
import { rectWalls } from './geometry';
import { FIXTURE_MOUNT_HEIGHT } from './fixtures';
import { kelvinToRgb } from './color';
import { computeCollisions, type CollisionItem } from './collision';
import { suggestLayout, type LayoutBounds } from './autolayout';

/**
 * What a vision model may propose after looking at a room photo. Deliberately narrow —
 * an axis-aligned rectangular room, not arbitrary polygons — so the geometry a model can
 * get wrong is bounded and everything downstream (openings, furniture) has a simple frame
 * of reference. Numeric bounds here are generous (a first line of defense); the real
 * clamping happens in `materializeRoomPhoto`, which also never trusts wall/opening math
 * enough to skip re-deriving it. Same golden rule as furniture placement: the model
 * proposes, deterministic code validates and places.
 */
export const RoomPhotoFurnitureCategorySchema = z.enum([
  'sofa',
  'armchair',
  'bench',
  'chair',
  'coffee_table',
  'dining_table',
  'side_table',
  'desk',
  'bed',
  'bookshelf',
  'tv_stand',
  'plant',
  'rug',
  'other',
]);
export type RoomPhotoFurnitureCategory = z.infer<typeof RoomPhotoFurnitureCategorySchema>;

export const RoomPhotoFurnitureSchema = z.object({
  category: RoomPhotoFurnitureCategorySchema,
  /** Normalized position within the room footprint (0..1 each axis). */
  nx: z.number().min(0).max(1),
  nz: z.number().min(0).max(1),
  rotationDeg: z.number().min(0).max(360).default(0),
  confidence: z.number().min(0).max(1).default(0.5),
});

/** Light-emitting furniture (floor/table lamps) is modeled as a fixture, not furniture —
 * it's the same distinction the rest of the app already draws between dumb geometry and
 * light sources. */
export const RoomPhotoFixtureSchema = z.object({
  kind: FixtureKindSchema,
  nx: z.number().min(0).max(1),
  nz: z.number().min(0).max(1),
  kelvin: z.number().min(1500).max(6500).default(2700),
  on: z.boolean().default(true),
});

export const RoomPhotoOpeningSchema = z.object({
  kind: z.enum(['window', 'door']),
  wall: z.enum(['N', 'S', 'E', 'W']),
  /** Fraction along the wall, from its first corner (going clockwise) toward the next. */
  positionAlongWall: z.number().min(0).max(1),
  widthMeters: z.number().min(0.3).max(4),
  heightMeters: z.number().min(0.3).max(2.6),
  sillHeightMeters: z.number().min(0).max(1.6).default(0.9),
});

export const RoomPhotoMaterialGuessSchema = z.object({
  /** Loosely validated here — a model can return an off-format string; `materializeRoomPhoto`
   * sanitizes it defensively rather than rejecting the whole proposal over a paint color. */
  colorHex: z.string().default('#e8e2d6'),
  finish: z.string().default('matte'),
});

export const RoomPhotoProposalSchema = z.object({
  roomLabel: z.string().max(60).optional(),
  roomWidthMeters: z.number().min(1.5).max(15),
  roomDepthMeters: z.number().min(1.5).max(15),
  ceilingHeightMeters: z.number().min(2.0).max(4.5).default(2.7),
  wallMaterial: RoomPhotoMaterialGuessSchema.default({ colorHex: '#efeae2', finish: 'matte' }),
  floorMaterial: RoomPhotoMaterialGuessSchema.default({ colorHex: '#d9d2c7', finish: 'matte' }),
  openings: z.array(RoomPhotoOpeningSchema).max(12).default([]),
  furniture: z.array(RoomPhotoFurnitureSchema).max(30).default([]),
  fixtures: z.array(RoomPhotoFixtureSchema).max(12).default([]),
  /** Short free-text explanation of the guesses (e.g. confidence, ambiguous cues) —
   * shown to the user, never trusted for anything structural. */
  notes: z.string().max(600).optional(),
});
export type RoomPhotoProposal = z.infer<typeof RoomPhotoProposalSchema>;

export interface RoomPhotoResult {
  doc: SceneDocument;
  /** Furniture the photo seemed to show that has no reasonable match in our small
   * low-poly catalog — dropped rather than forced into a wrong-looking placement. */
  skippedFurnitureCategories: string[];
  notes?: string;
}

/** category → catalog item. Dimensions are duplicated from packages/catalog (kept
 * dependency-free of it, same as the rest of core) — must stay in sync if that catalog
 * changes. `null` categories are always skipped rather than guessed at. */
const CATEGORY_TO_CATALOG: Record<RoomPhotoFurnitureCategory, { catalogId: string; width: number; depth: number } | null> = {
  sofa: { catalogId: 'sofa-2seat', width: 1.6, depth: 0.85 },
  armchair: { catalogId: 'armchair', width: 0.85, depth: 0.85 },
  bench: { catalogId: 'bench', width: 1.2, depth: 0.4 },
  chair: { catalogId: 'desk-chair', width: 0.55, depth: 0.55 },
  coffee_table: { catalogId: 'coffee-table', width: 1.1, depth: 0.6 },
  dining_table: { catalogId: 'dining-table', width: 1.6, depth: 0.9 },
  side_table: { catalogId: 'side-table', width: 0.5, depth: 0.5 },
  desk: { catalogId: 'desk', width: 1.2, depth: 0.6 },
  bed: { catalogId: 'bed-double', width: 1.6, depth: 2.0 },
  bookshelf: { catalogId: 'bookshelf', width: 0.9, depth: 0.35 },
  tv_stand: { catalogId: 'tv-stand', width: 1.4, depth: 0.4 },
  plant: { catalogId: 'plant', width: 0.5, depth: 0.5 },
  rug: { catalogId: 'rug', width: 2.0, depth: 1.4 },
  other: null,
};

const MIN_ROOM = 1.5;
const MAX_ROOM = 15;
const MIN_CEILING = 2.0;
const MAX_CEILING = 4.5;
const WALL_THICKNESS = 0.12;
const MARGIN = 0.05; // inset from the wall centerline, matches autolayout.ts

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (v: number) => Math.round(v * 1000) / 1000;
const normalizeDeg = (v: number) => ((v % 360) + 360) % 360;

/** No `crypto` global here — core's tsconfig has no DOM/node types (stays pure TS/JS),
 * and these ids only need to be unique within one generated document. */
function randomId(): string {
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

function sanitizeHex(input: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(input) ? input : fallback;
}

const FINISHES: Finish[] = ['matte', 'eggshell', 'satin', 'gloss'];
function sanitizeFinish(input: string): Finish {
  const lower = input.toLowerCase().trim();
  return (FINISHES as string[]).includes(lower) ? (lower as Finish) : 'matte';
}

/**
 * Turn a (validated but untrusted) RoomPhotoProposal into a real SceneDocument. Pure and
 * deterministic: same input always produces the same output, so this is fully unit
 * testable without a network call. Every dimension is re-clamped here regardless of the
 * zod bounds already applied on parse (defense in depth), openings are kept within their
 * host wall, and furniture placements that would overlap are re-resolved with the same
 * deterministic perimeter solver the manual "Suggest a layout" button uses.
 */
export function materializeRoomPhoto(proposal: RoomPhotoProposal): RoomPhotoResult {
  const width = clamp(proposal.roomWidthMeters, MIN_ROOM, MAX_ROOM);
  const depth = clamp(proposal.roomDepthMeters, MIN_ROOM, MAX_ROOM);
  const ceilingHeight = clamp(proposal.ceilingHeightMeters, MIN_CEILING, MAX_CEILING);
  const halfW = width / 2;
  const halfD = depth / 2;

  const walls = rectWalls(width, depth, ceilingHeight, WALL_THICKNESS);
  const wallLength: Record<'N' | 'S' | 'E' | 'W', number> = { N: width, S: width, E: depth, W: depth };

  const openings: Opening[] = proposal.openings.map((o) => {
    const len = wallLength[o.wall];
    const maxHeight = o.kind === 'door' ? 2.4 : Math.max(0.4, ceilingHeight - 0.2);
    const minHeight = o.kind === 'door' ? 1.8 : 0.4;
    const w = clamp(o.widthMeters, 0.4, Math.max(0.4, len - 0.2));
    const rawOffset = clamp(o.positionAlongWall, 0, 1) * len;
    return {
      id: randomId(),
      wallId: `wall-${o.wall}`,
      kind: o.kind,
      offset: round(clamp(rawOffset, 0, Math.max(0, len - w))),
      width: round(w),
      height: round(clamp(o.heightMeters, minHeight, maxHeight)),
      sillHeight: o.kind === 'door' ? 0 : round(clamp(o.sillHeightMeters, 0, Math.max(0, ceilingHeight - minHeight))),
      glassTint: 0.06,
      covering: { type: 'none', state: 'open' },
    };
  });

  const wallMaterial = {
    color: sanitizeHex(proposal.wallMaterial.colorHex, DEFAULT_WALL_MATERIAL.color),
    finish: sanitizeFinish(proposal.wallMaterial.finish),
  };
  const floorMaterial = {
    color: sanitizeHex(proposal.floorMaterial.colorHex, DEFAULT_FLOOR_MATERIAL.color),
    finish: sanitizeFinish(proposal.floorMaterial.finish),
  };

  // ---- furniture: map category -> catalog item, clamp inside the room, then resolve
  // any overlaps with the same deterministic perimeter solver "Suggest a layout" uses ----
  const skippedFurnitureCategories: string[] = [];
  const placed: { id: string; catalogId: string; x: number; z: number; rotationY: number; w: number; d: number }[] = [];
  for (const f of proposal.furniture) {
    const mapping = CATEGORY_TO_CATALOG[f.category];
    if (!mapping) {
      skippedFurnitureCategories.push(f.category);
      continue;
    }
    const loX = -halfW + mapping.width / 2 + MARGIN;
    const hiX = halfW - mapping.width / 2 - MARGIN;
    const loZ = -halfD + mapping.depth / 2 + MARGIN;
    const hiZ = halfD - mapping.depth / 2 - MARGIN;
    const x = loX <= hiX ? clamp(-halfW + f.nx * width, loX, hiX) : 0;
    const z = loZ <= hiZ ? clamp(-halfD + f.nz * depth, loZ, hiZ) : 0;
    placed.push({ id: randomId(), catalogId: mapping.catalogId, x, z, rotationY: normalizeDeg(f.rotationDeg), w: mapping.width, d: mapping.depth });
  }

  // If ANYTHING overlaps, re-lay out the whole set with the same deterministic perimeter
  // solver "Suggest a layout" uses (guaranteed collision-free by its own contract).
  // Repositioning only the colliding subset isn't enough — it can just as easily land a
  // moved piece on top of one that was fine, since the solver placing that subset has no
  // way to know about the untouched items' positions.
  const collisionItems: CollisionItem[] = placed.map((p) => ({ id: p.id, cx: p.x, cz: p.z, width: p.w, depth: p.d, rotationDeg: p.rotationY }));
  if (computeCollisions(collisionItems).size > 0) {
    const bounds: LayoutBounds = { minX: -halfW, maxX: halfW, minZ: -halfD, maxZ: halfD };
    const replacements = suggestLayout(bounds, placed.map((p) => ({ id: p.id, width: p.w, depth: p.d })));
    const byId = new Map(replacements.map((r) => [r.id, r]));
    for (const p of placed) {
      const r = byId.get(p.id)!;
      p.x = r.x;
      p.z = r.z;
      p.rotationY = r.rotationY;
    }
  }

  const furniture: FurnitureInstance[] = placed.map((p) => ({
    id: p.id,
    catalogId: p.catalogId,
    position: { x: round(p.x), y: 0, z: round(p.z) },
    rotationY: p.rotationY,
    scale: 1,
  }));

  // ---- fixtures: light-emitting furniture (lamps) — same normalized-position mapping,
  // fixed mount height per kind (a physical convention, not something to guess) ----
  const lights: LightInstance[] = proposal.fixtures.map((fx) => {
    const kelvin = clamp(fx.kelvin, 1500, 6500);
    const x = clamp(-halfW + fx.nx * width, -halfW + MARGIN, halfW - MARGIN);
    const z = clamp(-halfD + fx.nz * depth, -halfD + MARGIN, halfD - MARGIN);
    return {
      id: randomId(),
      kind: fx.kind,
      position: { x: round(x), y: FIXTURE_MOUNT_HEIGHT[fx.kind], z: round(z) },
      intensityCandela: 300,
      color: kelvinToRgb(kelvin),
      kelvin,
      on: fx.on,
      castShadow: true,
      auto: false,
    };
  });

  const name = proposal.roomLabel?.trim() || 'Room from Photo';
  const doc: SceneDocument = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: randomId(),
    name,
    // Placeholder — the import flow prompts the user to set their real location and
    // orientation right after this, same PII handling as everywhere else (coarse
    // lat/lng only, no address ever enters the document).
    site: { lat: 0, lng: 0, trueNorthOffsetDeg: 0 },
    rooms: [
      {
        id: randomId(),
        name,
        walls,
        materials: { wall: wallMaterial, floor: floorMaterial, ceiling: DEFAULT_CEILING_MATERIAL },
      },
    ],
    openings,
    furniture,
    lights,
    lightingScenes: [],
    view: {
      timeOfDay: '2026-06-21T16:00:00',
      camera: {
        position: { x: width * 0.9 + 2, y: Math.max(3, ceilingHeight * 1.6), z: depth * 0.9 + 2 },
        target: { x: 0, y: 1, z: 0 },
      },
    },
  };

  return { doc, skippedFurnitureCategories, notes: proposal.notes };
}
