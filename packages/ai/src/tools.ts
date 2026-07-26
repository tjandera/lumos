/**
 * Tool schemas for the LLM tool-calling interface.
 *
 * The scene-document primitives already live in `@interior/core`'s zod schema
 * (the single source of truth); we reuse them and add the AI-only *constraint
 * vocabulary* here. Constraints are intents ("nearWall", "facing X"), never raw
 * coordinates — the deterministic solver turns them into validated positions.
 *
 * Tool `parameters` are DERIVED from these zod schemas via `zod-to-json-schema`
 * so the JSON Schema the LLM sees can never drift from what the executor
 * validates against. `tools.snapshot.test.ts` locks the generated JSON Schema.
 */

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolDefinition } from "./provider.js";

/** Zones a placement can target. */
export const zoneSchema = z.enum(["corner", "center", "window"]);
export type Zone = z.infer<typeof zoneSchema>;

/**
 * Placement constraint vocabulary shared by `placeFurniture` and `moveItem`.
 * All fields optional; an empty object means "put it somewhere valid".
 */
export const placementConstraintsSchema = z
  .object({
    /** Prefer a position flush against a wall. */
    nearWall: z.boolean().optional(),
    /** Orient the item to face another item (by its id). */
    facingItem: z.string().optional(),
    /** Prefer a position adjacent (close) to another item (by its id). */
    adjacentTo: z.string().optional(),
    /** Target region of the room. */
    zone: zoneSchema.optional(),
    /** Minimum walkway/clearance in meters kept in front of the item. */
    minClearance: z.number().positive().max(10).optional()
  })
  .strict();
export type PlacementConstraints = z.infer<typeof placementConstraintsSchema>;

/**
 * `moveItem` accepts the full placement vocabulary plus relative nudges.
 */
export const moveConstraintsSchema = placementConstraintsSchema
  .extend({
    /** Nudge the item toward its nearest wall. */
    towardWall: z.boolean().optional(),
    /** Rotate the item in place by this many degrees (relative). */
    rotateDeg: z.number().min(-360).max(360).optional()
  })
  .strict();
export type MoveConstraints = z.infer<typeof moveConstraintsSchema>;

const timeRegex = /^([01]?\d|2[0-3]):[0-5]\d$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const placeFurnitureArgsSchema = z
  .object({
    catalogId: z.string().min(1),
    constraints: placementConstraintsSchema.optional().default({})
  })
  .strict();
export type PlaceFurnitureArgs = z.infer<typeof placeFurnitureArgsSchema>;

export const moveItemArgsSchema = z
  .object({
    itemId: z.string().min(1),
    constraints: moveConstraintsSchema.optional().default({})
  })
  .strict();
export type MoveItemArgs = z.infer<typeof moveItemArgsSchema>;

export const removeItemArgsSchema = z
  .object({
    itemId: z.string().min(1)
  })
  .strict();
export type RemoveItemArgs = z.infer<typeof removeItemArgsSchema>;

export const setTimeOfDayArgsSchema = z
  .object({
    time: z.string().regex(timeRegex, "time must be HH:MM (24-hour)"),
    date: z.string().regex(dateRegex, "date must be YYYY-MM-DD").optional()
  })
  .strict();
export type SetTimeOfDayArgs = z.infer<typeof setTimeOfDayArgsSchema>;

export const toggleLampArgsSchema = z
  .object({
    itemId: z.string().min(1),
    on: z.boolean()
  })
  .strict();
export type ToggleLampArgs = z.infer<typeof toggleLampArgsSchema>;

export const querySpaceArgsSchema = z.object({}).strict();
export type QuerySpaceArgs = z.infer<typeof querySpaceArgsSchema>;

export const suggestLayoutArgsSchema = z
  .object({
    style: z.string().optional(),
    budget: z.number().positive().optional(),
    itemCatalogIds: z.array(z.string().min(1)).optional()
  })
  .strict();
export type SuggestLayoutArgs = z.infer<typeof suggestLayoutArgsSchema>;

/** Every tool name understood by the executor. */
export const TOOL_NAMES = [
  "placeFurniture",
  "moveItem",
  "removeItem",
  "setTimeOfDay",
  "toggleLamp",
  "querySpace",
  "suggestLayout"
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** Zod schema for each tool's arguments, keyed by tool name. */
export const toolArgSchemas = {
  placeFurniture: placeFurnitureArgsSchema,
  moveItem: moveItemArgsSchema,
  removeItem: removeItemArgsSchema,
  setTimeOfDay: setTimeOfDayArgsSchema,
  toggleLamp: toggleLampArgsSchema,
  querySpace: querySpaceArgsSchema,
  suggestLayout: suggestLayoutArgsSchema
} as const satisfies Record<ToolName, z.ZodTypeAny>;

const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  placeFurniture:
    "Add a catalog item to the room using spatial CONSTRAINTS (e.g. nearWall, facing another item, a zone) — never coordinates. A deterministic solver finds a collision-free, clearance-respecting position, or reports why it could not.",
  moveItem:
    "Reposition or reorient an existing item by id using the same constraint vocabulary, plus relative nudges (towardWall, rotateDeg). The solver re-validates; an invalid move is rejected, never applied.",
  removeItem: "Remove an existing item from the room by its id (also removes any lamp attached to it).",
  setTimeOfDay: "Set the time of day (and optionally the date) that drives the sun position and shadows.",
  toggleLamp: "Turn a lamp on or off for a given furniture item id.",
  querySpace:
    "Return ground-truth facts about the room: dimensions, approximate free floor area, and every item's position and clearances. Call this before reasoning about space so you rely on facts, not guesses.",
  suggestLayout:
    "Propose a full-room layout. Optionally constrain by style, total budget, or an explicit list of catalog item ids. The solver places the whole set together, collision-free."
};

/**
 * Convert a zod schema to a JSON Schema suitable for a tool's `parameters`.
 * We inline the schema (no `name`/`$ref` wrapper) so the result is a plain
 * `type: "object"` schema, which is what OpenAI-compatible tool APIs expect.
 */
function toParameters(schema: z.ZodTypeAny): Record<string, unknown> {
  const json = zodToJsonSchema(schema, { $refStrategy: "none", target: "jsonSchema7" }) as Record<string, unknown>;
  // Drop the `$schema` meta key; tool parameter schemas don't need it.
  delete json.$schema;
  return json;
}

/**
 * The tool definitions handed to a `ChatProvider`. `parameters` is a JSON
 * Schema derived from the zod schema above, so it stays in lock-step with what
 * the executor validates.
 */
export const toolDefinitions: ToolDefinition[] = TOOL_NAMES.map((name) => ({
  name,
  description: TOOL_DESCRIPTIONS[name],
  parameters: toParameters(toolArgSchemas[name])
}));

/** Map of tool name -> definition, for quick lookup. */
export const toolDefinitionsByName: Record<ToolName, ToolDefinition> = Object.fromEntries(
  toolDefinitions.map((def) => [def.name, def])
) as Record<ToolName, ToolDefinition>;

/** Type guard: is `name` a tool the executor understands? */
export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}
