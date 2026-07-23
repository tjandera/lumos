/**
 * Zod schema for the scene document — the single source of truth for
 * validation. The API validates request bodies against it, `migrate()`
 * validates its output against it, and (Phase 4) the AI tool schemas will be
 * derived from it. The hand-written TypeScript interfaces in `types.ts` are
 * kept structurally compatible with these schemas; `schema.type.test.ts`
 * asserts that compatibility at compile time.
 *
 * NodeNext note: relative imports carry an explicit `.js` extension.
 */

import { z } from "zod";
import { CURRENT_SCHEMA_VERSION } from "./types.js";

export const point2DSchema = z
  .object({
    x: z.number(),
    y: z.number()
  })
  .strict();

export const vector3Schema = z
  .object({
    x: z.number(),
    y: z.number(),
    z: z.number()
  })
  .strict();

export const dimensions3DSchema = z
  .object({
    w: z.number(),
    d: z.number(),
    h: z.number()
  })
  .strict();

export const openingSchema = z
  .object({
    id: z.string(),
    type: z.enum(["window", "door"]),
    wallIndex: z.number().int().nonnegative(),
    position: z.number(),
    width: z.number(),
    height: z.number(),
    sillHeight: z.number()
  })
  .strict();

export const roomSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    walls: z.array(point2DSchema),
    wallThickness: z.number(),
    height: z.number(),
    openings: z.array(openingSchema)
  })
  .strict();

export const furnitureItemSchema = z
  .object({
    id: z.string(),
    catalogId: z.string(),
    position: vector3Schema,
    rotationY: z.number(),
    dimensions: dimensions3DSchema
  })
  .strict();

export const sunLightConfigSchema = z
  .object({
    type: z.literal("sun"),
    id: z.string(),
    date: z.string(),
    time: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    northOffset: z.number()
  })
  .strict();

export const lampLightConfigSchema = z
  .object({
    type: z.literal("lamp"),
    id: z.string(),
    furnitureItemId: z.string(),
    intensity: z.number(),
    color: z.string(),
    on: z.boolean()
  })
  .strict();

export const lightSourceSchema = z.discriminatedUnion("type", [sunLightConfigSchema, lampLightConfigSchema]);

export const sceneMetaSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    createdAt: z.string(),
    updatedAt: z.string()
  })
  .strict();

/**
 * Coarse siting only. `.strict()` (no unknown keys) is load-bearing for the
 * PII rule: a street address (or any `address`/`street`/`postcode`-like field)
 * MUST NOT appear in the document. `schema.pii.test.ts` asserts this schema's
 * key set contains no address-like keys, and that a payload carrying an
 * `address` is rejected.
 */
export const siteSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    trueNorthOffsetDeg: z.number()
  })
  .strict();

/**
 * A full, validated scene document at the current schema version. A valid
 * document always carries `schemaVersion === CURRENT_SCHEMA_VERSION` and a
 * `site` block (unlike the TS interface, where both are optional purely for
 * back-compat with legacy construction sites). Unknown top-level keys are
 * stripped, which also means any stray PII field cannot survive validation.
 */
export const sceneDocumentSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  site: siteSchema,
  meta: sceneMetaSchema,
  rooms: z.array(roomSchema),
  furniture: z.array(furnitureItemSchema),
  lights: z.array(lightSourceSchema)
});

/** The document type as inferred from the zod schema (all fields required). */
export type ValidatedSceneDocument = z.infer<typeof sceneDocumentSchema>;
