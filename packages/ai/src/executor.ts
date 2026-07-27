/**
 * Tool executor: the trusted boundary between the LLM's tool calls and the
 * scene document.
 *
 * Contract for every call:
 *  1. Validate arguments with the tool's zod schema (reject → structured error,
 *     never a throw that stops the loop).
 *  2. Apply the effect through `@interior/core` pure functions + the solver.
 *  3. Return a NEW document (immutable) so the web store can wrap one executor
 *     call in exactly one undo batch, plus a compact `resultForLLM` (including
 *     any failures) to feed back into the tool loop.
 *
 * The executor NEVER trusts coordinates from the model: placement always goes
 * through the deterministic solver, which validates or rejects.
 */

import {
  addFurniture,
  FIXTURE_MOUNT_HEIGHT,
  moveFurniture,
  polygonAbsArea,
  removeFurniture,
  roomCorners,
  type FurnitureInstance,
  type Room,
  type SceneDocument,
} from "@interior/core";
import { z } from "zod";
import type { CatalogItem } from "./catalog.js";
import { findCatalogItem, needsFrontClearance } from "./catalog.js";
import { planLayout } from "./layout.js";
import { addLampLight, createLampLight, getLampForFurniture, setLampOn, setViewTimeOfDay } from "./lights.js";
import { isPlacementValid, solve, type PlacementRequest, type SolveResult } from "./solver.js";
import type { ToolCall } from "./provider.js";
import { isToolName, toolArgSchemas, type ToolName } from "./tools.js";

export interface ExecuteContext {
  catalog: CatalogItem[];
  /** Which room to operate in; defaults to the first room in the document. */
  roomId?: string;
  /** Id factory (injectable so tests can be deterministic). */
  generateId?: () => string;
}

export interface ToolResult {
  /** The resulting document (a new object if changed, else the input document). */
  document: SceneDocument;
  /** Compact, JSON-serializable result to hand back to the LLM. */
  resultForLLM: unknown;
  /** Whether the document was mutated (drives one-call-one-undo-batch). */
  changed: boolean;
}

function activeRoom(document: SceneDocument, roomId?: string): Room | undefined {
  if (roomId) return document.rooms.find((r) => r.id === roomId);
  return document.rooms[0];
}

function summarizePlacement(result: SolveResult): unknown {
  return {
    placed: result.placed.map((p) => ({
      itemId: p.itemId,
      catalogId: p.catalogId,
      position: { x: round(p.position.x), y: round(p.position.y), z: round(p.position.z) },
      rotationDeg: round(p.rotationY),
    })),
    failed: result.failed.map((f) => ({ itemId: f.itemId, catalogId: f.catalogId, reason: f.reason, message: f.message })),
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function placedToFurniture(p: SolveResult["placed"][number]): FurnitureInstance {
  return {
    id: p.itemId,
    catalogId: p.catalogId,
    position: p.position,
    rotationY: p.rotationY,
    scale: 1,
    dimensions: p.dimensions,
  };
}

/**
 * Execute a single tool call against the document. Argument validation
 * failures and domain failures (no room, unknown catalog id, unplaceable
 * item) are returned as `{ ok: false, ... }` results — the loop feeds them
 * back to the model rather than crashing.
 */
export function executeTool(document: SceneDocument, call: ToolCall, context: ExecuteContext): ToolResult {
  if (!isToolName(call.name)) {
    return unchanged(document, { ok: false, error: "unknown_tool", tool: call.name });
  }

  const parsed = parseArgs(call.name, call.arguments);
  if (!parsed.ok) {
    return unchanged(document, { ok: false, error: "invalid_arguments", tool: call.name, issues: parsed.issues });
  }
  const generateId = context.generateId ?? (() => crypto.randomUUID());

  switch (call.name) {
    case "placeFurniture":
      return placeFurniture(document, parsed.value as Args<"placeFurniture">, context, generateId);
    case "moveItem":
      return moveItem(document, parsed.value as Args<"moveItem">, context);
    case "removeItem":
      return removeItem(document, parsed.value as Args<"removeItem">);
    case "setTimeOfDay":
      return setTimeOfDay(document, parsed.value as Args<"setTimeOfDay">);
    case "toggleLamp":
      return toggleLamp(document, parsed.value as Args<"toggleLamp">, generateId);
    case "querySpace":
      return querySpace(document, context);
    case "suggestLayout":
      return suggestLayout(document, parsed.value as Args<"suggestLayout">, context, generateId);
    default:
      return unchanged(document, { ok: false, error: "unknown_tool", tool: call.name });
  }
}

type Args<N extends ToolName> = z.infer<(typeof toolArgSchemas)[N]>;

function parseArgs(
  name: ToolName,
  raw: string,
): { ok: true; value: unknown } | { ok: false; issues: unknown } {
  let json: unknown;
  try {
    json = raw.trim() === "" ? {} : JSON.parse(raw);
  } catch {
    return { ok: false, issues: [{ message: "arguments were not valid JSON" }] };
  }
  const schema = toolArgSchemas[name];
  const result = schema.safeParse(json);
  if (!result.success) {
    return { ok: false, issues: result.error.issues };
  }
  return { ok: true, value: result.data };
}

// --- individual tools ------------------------------------------------------

function placeFurniture(
  document: SceneDocument,
  args: Args<"placeFurniture">,
  context: ExecuteContext,
  generateId: () => string,
): ToolResult {
  const item = findCatalogItem(context.catalog, args.catalogId);
  if (!item) {
    return unchanged(document, { ok: false, error: "unknown_catalog_id", catalogId: args.catalogId });
  }
  const room = activeRoom(document, context.roomId);
  const request: PlacementRequest = {
    catalogId: item.id,
    itemId: generateId(),
    dimensions: item.dimensions,
    category: item.category,
    constraints: args.constraints,
    isExisting: false,
  };
  const result = solve(document, room, [request]);
  const placed = result.placed[0];
  if (!placed) {
    return unchanged(document, { ok: false, error: "not_placed", ...(summarizePlacement(result) as object) });
  }
  const next = addFurniture(document, placedToFurniture(placed));
  return { document: next, changed: true, resultForLLM: { ok: true, ...(summarizePlacement(result) as object) } };
}

function moveItem(document: SceneDocument, args: Args<"moveItem">, context: ExecuteContext): ToolResult {
  const existing = document.furniture.find((f) => f.id === args.itemId);
  if (!existing) {
    return unchanged(document, { ok: false, error: "item_not_found", itemId: args.itemId });
  }
  const room = activeRoom(document, context.roomId);
  const catalogItem = findCatalogItem(context.catalog, existing.catalogId);
  const category = catalogItem?.category;
  const dims = existing.dimensions ?? catalogItem?.dimensions;
  const c = args.constraints;

  const hasPositional =
    c.nearWall || c.towardWall || c.zone !== undefined || c.facingItem !== undefined || c.adjacentTo !== undefined;

  // Pure in-place rotation (no positional constraint): validate, don't reposition.
  if (c.rotateDeg !== undefined && !hasPositional) {
    const rotationY = existing.rotationY + c.rotateDeg;
    const candidate: FurnitureInstance = { ...existing, rotationY };
    const enforceFront = category ? needsFrontClearance(category) : false;
    if (!isPlacementValid(document, room, candidate, { excludeId: existing.id, enforceFront, dimensions: dims })) {
      return unchanged(document, {
        ok: false,
        error: "not_placed",
        reason: "no-space",
        message: "Rotating the item there would cause a collision or leave no clearance.",
      });
    }
    const next = moveFurniture(document, existing.id, { rotationY });
    return {
      document: next,
      changed: true,
      resultForLLM: { ok: true, itemId: existing.id, rotationDeg: round(rotationY) },
    };
  }

  if (!dims) {
    return unchanged(document, {
      ok: false,
      error: "not_placed",
      reason: "item-not-found",
      message: "No dimensions are known for this item; cannot reposition it.",
    });
  }

  // Otherwise run the solver with the given constraints (towardWall -> nearWall).
  const request: PlacementRequest = {
    catalogId: existing.catalogId,
    itemId: existing.id,
    dimensions: dims,
    category,
    constraints: { ...c, nearWall: c.nearWall || c.towardWall },
    isExisting: true,
  };
  const result = solve(document, room, [request]);
  const placed = result.placed[0];
  if (!placed) {
    return unchanged(document, { ok: false, error: "not_placed", ...(summarizePlacement(result) as object) });
  }
  let rotationY = placed.rotationY;
  if (c.rotateDeg !== undefined) {
    rotationY = rotationY + c.rotateDeg;
  }
  const next = moveFurniture(document, existing.id, { position: placed.position, rotationY });
  return { document: next, changed: true, resultForLLM: { ok: true, ...(summarizePlacement(result) as object) } };
}

function removeItem(document: SceneDocument, args: Args<"removeItem">): ToolResult {
  const exists = document.furniture.some((f) => f.id === args.itemId);
  if (!exists) {
    return unchanged(document, { ok: false, error: "item_not_found", itemId: args.itemId });
  }
  // `removeFurniture` also drops any lamp bound to this item via furnitureItemId.
  const next = removeFurniture(document, args.itemId);
  return { document: next, changed: true, resultForLLM: { ok: true, removed: args.itemId } };
}

function setTimeOfDay(document: SceneDocument, args: Args<"setTimeOfDay">): ToolResult {
  const date = args.date ?? document.view.timeOfDay.slice(0, 10);
  const timeOfDay = `${date}T${args.time}:00`;
  const next = setViewTimeOfDay(document, timeOfDay);
  return { document: next, changed: true, resultForLLM: { ok: true, timeOfDay } };
}

function toggleLamp(document: SceneDocument, args: Args<"toggleLamp">, generateId: () => string): ToolResult {
  const item = document.furniture.find((f) => f.id === args.itemId);
  if (!item) {
    return unchanged(document, { ok: false, error: "item_not_found", itemId: args.itemId });
  }
  const existingLamp = getLampForFurniture(document, args.itemId);
  if (existingLamp) {
    const next = setLampOn(document, existingLamp.id, args.on);
    return { document: next, changed: true, resultForLLM: { ok: true, itemId: args.itemId, on: args.on } };
  }
  const lamp = createLampLight(generateId(), args.itemId, {
    on: args.on,
    position: { x: item.position.x, y: FIXTURE_MOUNT_HEIGHT.table, z: item.position.z },
  });
  const next = addLampLight(document, lamp);
  return { document: next, changed: true, resultForLLM: { ok: true, itemId: args.itemId, on: args.on, created: true } };
}

function querySpace(document: SceneDocument, context: ExecuteContext): ToolResult {
  const room = activeRoom(document, context.roomId);
  if (!room) {
    return unchanged(document, { ok: true, room: null, note: "No room has been drawn yet." });
  }
  const corners = roomCorners(room);
  const floorArea = polygonAbsArea(corners);
  const footprintArea = document.furniture.reduce(
    (sum, f) => sum + (f.dimensions ? f.dimensions.w * f.dimensions.d : 0),
    0,
  );
  const xs = corners.map((c) => c.x);
  const zs = corners.map((c) => c.z);
  const width = Math.max(...xs) - Math.min(...xs);
  const depth = Math.max(...zs) - Math.min(...zs);
  const ceilingHeight = room.walls.reduce((max, w) => Math.max(max, w.height), 0);
  const openings = document.openings.filter((o) => room.walls.some((w) => w.id === o.wallId));

  return unchanged(document, {
    ok: true,
    room: {
      id: room.id,
      name: room.name,
      boundingSize: { width: round(width), depth: round(depth) },
      floorAreaM2: round(floorArea),
      approxFreeFloorAreaM2: round(Math.max(0, floorArea - footprintArea)),
      ceilingHeight,
      openings: openings.map((o) => ({ id: o.id, kind: o.kind, width: o.width })),
    },
    items: document.furniture.map((f) => ({
      itemId: f.id,
      catalogId: f.catalogId,
      position: { x: round(f.position.x), z: round(f.position.z) },
      rotationDeg: round(f.rotationY),
      footprint: f.dimensions ? { w: f.dimensions.w, d: f.dimensions.d } : null,
    })),
  });
}

function suggestLayout(
  document: SceneDocument,
  args: Args<"suggestLayout">,
  context: ExecuteContext,
  generateId: () => string,
): ToolResult {
  const room = activeRoom(document, context.roomId);
  const planned = planLayout({
    catalog: context.catalog,
    style: args.style,
    budget: args.budget,
    itemCatalogIds: args.itemCatalogIds,
    generateId,
  });

  if (planned.requests.length === 0) {
    return unchanged(document, {
      ok: false,
      error: "no_items_selected",
      message: "No catalog items matched the request (check style/budget/itemCatalogIds).",
    });
  }

  const result = solve(document, room, planned.requests);
  let next = document;
  for (const placed of result.placed) {
    next = addFurniture(next, placedToFurniture(placed));
  }
  const changed = result.placed.length > 0;
  const totalPrice = planned.items
    .filter((item) => result.placed.some((p) => p.catalogId === item.id))
    .reduce((sum, item) => sum + item.price, 0);

  return {
    document: next,
    changed,
    resultForLLM: {
      ok: changed,
      totalPrice,
      ...(summarizePlacement(result) as object),
    },
  };
}

// --- helpers ---------------------------------------------------------------

function unchanged(document: SceneDocument, resultForLLM: unknown): ToolResult {
  return { document, changed: false, resultForLLM };
}
