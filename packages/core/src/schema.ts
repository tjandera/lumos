import { z } from 'zod';

/**
 * Bump this whenever the SceneDocument shape changes, and add a migrator in
 * migrations.ts keyed by the version it upgrades FROM. Saved and shared designs
 * are validated + migrated on load, so they survive schema evolution.
 */
export const CURRENT_SCHEMA_VERSION = 5;

const Vec2Schema = z.object({ x: z.number(), z: z.number() }); // ground-plane point (meters)
const Vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });

export const WallSchema = z.object({
  id: z.string(),
  start: Vec2Schema,
  end: Vec2Schema,
  thickness: z.number().positive(), // meters
  height: z.number().positive(), // meters
});

/** Daylight control for a window: fully open (no extra occlusion) or fully closed
 * (opaque — blocks the sun/lux studies exactly like a wall). No partial state: a
 * curtain/blind either is or isn't doing its job for a light study. */
export const CoveringSchema = z.object({
  type: z.enum(['none', 'curtains', 'blinds']).default('none'),
  state: z.enum(['open', 'closed']).default('open'),
});

export const OpeningSchema = z.object({
  id: z.string(),
  wallId: z.string(),
  kind: z.enum(['window', 'door']),
  offset: z.number().nonnegative(), // meters along the wall from its start
  width: z.number().positive(),
  height: z.number().positive(),
  sillHeight: z.number().nonnegative(), // meters from floor (0 for doors)
  /** Window-only (present but unused on doors): 0 = clear, 1 = fully tinted/opaque.
   * Cosmetic — the light studies treat glass as transmissive regardless of tint;
   * `covering` below is what actually blocks daylight. */
  glassTint: z.number().min(0).max(1).default(0.06),
  covering: CoveringSchema.default({ type: 'none', state: 'open' }),
});

/** Named paint/flooring sheen — see materials.ts for the roughness each maps to. */
export const FinishSchema = z.enum(['matte', 'eggshell', 'satin', 'gloss']);

export const MaterialSchema = z.object({
  color: z.string(), // hex, e.g. "#efeae2"
  finish: FinishSchema.default('matte'),
});

export const DEFAULT_WALL_MATERIAL = { color: '#efeae2', finish: 'matte' } as const;
export const DEFAULT_FLOOR_MATERIAL = { color: '#d9d2c7', finish: 'matte' } as const;
export const DEFAULT_CEILING_MATERIAL = { color: '#f5f2ea', finish: 'matte' } as const;

export const RoomMaterialsSchema = z
  .object({ wall: MaterialSchema, floor: MaterialSchema, ceiling: MaterialSchema })
  .default({ wall: DEFAULT_WALL_MATERIAL, floor: DEFAULT_FLOOR_MATERIAL, ceiling: DEFAULT_CEILING_MATERIAL });

export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  walls: z.array(WallSchema),
  materials: RoomMaterialsSchema,
});

export const FurnitureInstanceSchema = z.object({
  id: z.string(),
  catalogId: z.string(),
  position: Vec3Schema,
  rotationY: z.number(), // degrees
  scale: z.number().positive().default(1),
});

/** Which real fixture this light is + how it mounts (ceiling/wall vs floor/table). */
export const FixtureKindSchema = z.enum(['ceiling', 'wall', 'floor', 'table']);

export const LightInstanceSchema = z.object({
  id: z.string(),
  kind: FixtureKindSchema.default('table'),
  position: Vec3Schema,
  intensityCandela: z.number().nonnegative(),
  color: z.string(), // hex, e.g. "#ffe6b0" — kept in sync with `kelvin` by the UI
  kelvin: z.number().min(1000).max(10000).default(2700),
  on: z.boolean().default(true),
  castShadow: z.boolean().default(true),
  /** Auto-ramp brightness up as daylight fades (dusk/night), down in daytime. */
  auto: z.boolean().default(false),
});

/** A named, recallable snapshot of the lighting setup ("Evening", "Reading", ...). */
export const LightingSceneSchema = z.object({
  id: z.string(),
  name: z.string(),
  sunMode: z.enum(['auto', 'manual']),
  timeMinutes: z.number(),
  weather: z.enum(['clear', 'hazy', 'overcast', 'golden']),
  sunIntensity: z.number(),
  exposure: z.number(),
  sunWarmth: z.number(),
  lights: z.array(
    z.object({ id: z.string(), on: z.boolean(), intensityCandela: z.number(), kelvin: z.number() }),
  ),
});

export const SiteSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  trueNorthOffsetDeg: z.number(), // see units.ts
});

export const ViewSchema = z.object({
  timeOfDay: z.string(), // ISO 8601 local datetime for the site
  camera: z.object({ position: Vec3Schema, target: Vec3Schema }),
});

export const SceneDocumentSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  id: z.string(),
  name: z.string(),
  site: SiteSchema,
  rooms: z.array(RoomSchema),
  openings: z.array(OpeningSchema),
  furniture: z.array(FurnitureInstanceSchema),
  lights: z.array(LightInstanceSchema),
  lightingScenes: z.array(LightingSceneSchema).default([]),
  view: ViewSchema,
});

export type Vec2 = z.infer<typeof Vec2Schema>;
export type Vec3 = z.infer<typeof Vec3Schema>;
export type Wall = z.infer<typeof WallSchema>;
export type Opening = z.infer<typeof OpeningSchema>;
export type Covering = z.infer<typeof CoveringSchema>;
export type Finish = z.infer<typeof FinishSchema>;
export type Material = z.infer<typeof MaterialSchema>;
export type RoomMaterials = z.infer<typeof RoomMaterialsSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type FurnitureInstance = z.infer<typeof FurnitureInstanceSchema>;
export type FixtureKind = z.infer<typeof FixtureKindSchema>;
export type LightInstance = z.infer<typeof LightInstanceSchema>;
export type LightingScene = z.infer<typeof LightingSceneSchema>;
export type Site = z.infer<typeof SiteSchema>;
export type SceneDocument = z.infer<typeof SceneDocumentSchema>;

/** Parse + validate unknown data as a current SceneDocument (throws on invalid). */
export function parseSceneDocument(data: unknown): SceneDocument {
  return SceneDocumentSchema.parse(data);
}

/** Non-throwing variant — returns a zod SafeParseReturn. */
export function safeParseSceneDocument(data: unknown) {
  return SceneDocumentSchema.safeParse(data);
}
