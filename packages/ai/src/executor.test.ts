import { describe, expect, it } from "vitest";
import { SceneDocumentSchema } from "@interior/core";
import { executeTool, type ExecuteContext } from "./executor.js";
import type { ToolCall } from "./provider.js";
import { docWithRoom, testCatalog } from "./test-fixtures.js";

function idFactory(): () => string {
  let n = 0;
  return () => `gen-${++n}`;
}

function ctx(overrides: Partial<ExecuteContext> = {}): ExecuteContext {
  return { catalog: testCatalog, generateId: idFactory(), ...overrides };
}

function call(name: string, args: unknown): ToolCall {
  return { id: "c1", name, arguments: JSON.stringify(args) };
}

describe("executeTool argument validation", () => {
  it("rejects unknown tools without throwing", () => {
    const doc = docWithRoom();
    const res = executeTool(doc, call("frobnicate", {}), ctx());
    expect(res.changed).toBe(false);
    expect(res.resultForLLM).toMatchObject({ ok: false, error: "unknown_tool" });
  });

  it("rejects invalid arguments with structured issues", () => {
    const doc = docWithRoom();
    const res = executeTool(doc, { id: "c", name: "placeFurniture", arguments: "{ not json" }, ctx());
    expect(res.resultForLLM).toMatchObject({ ok: false, error: "invalid_arguments" });
    expect(res.document).toBe(doc); // unchanged reference
  });

  it("rejects extra/unknown constraint keys (strict schema)", () => {
    const doc = docWithRoom();
    const res = executeTool(doc, call("placeFurniture", { catalogId: "sofa-oslo-3seat", constraints: { hacked: true } }), ctx());
    expect(res.resultForLLM).toMatchObject({ ok: false, error: "invalid_arguments" });
  });

  it("rejects a bad time format for setTimeOfDay", () => {
    const doc = docWithRoom();
    const res = executeTool(doc, call("setTimeOfDay", { time: "5pm" }), ctx());
    expect(res.resultForLLM).toMatchObject({ ok: false, error: "invalid_arguments" });
  });
});

describe("executeTool mutations are immutable + schema-valid", () => {
  it("placeFurniture adds an item and returns a new, valid document", () => {
    const doc = docWithRoom();
    const res = executeTool(doc, call("placeFurniture", { catalogId: "sofa-oslo-3seat", constraints: { nearWall: true } }), ctx());
    expect(res.changed).toBe(true);
    expect(res.document).not.toBe(doc);
    expect(doc.furniture).toHaveLength(0); // input untouched
    expect(res.document.furniture).toHaveLength(1);
    expect(res.document.furniture[0]!.id).toBe("gen-1");
    expect(SceneDocumentSchema.safeParse(res.document).success).toBe(true);
  });

  it("placeFurniture reports unknown catalog id", () => {
    const doc = docWithRoom();
    const res = executeTool(doc, call("placeFurniture", { catalogId: "does-not-exist" }), ctx());
    expect(res.changed).toBe(false);
    expect(res.resultForLLM).toMatchObject({ ok: false, error: "unknown_catalog_id" });
  });

  it("moveItem rotates an existing item in place when validated", () => {
    const doc = docWithRoom();
    const placed = executeTool(doc, call("placeFurniture", { catalogId: "table-coffee-mira", constraints: { zone: "center" } }), ctx());
    const id = placed.document.furniture[0]!.id;
    const before = placed.document.furniture[0]!.rotationY;
    const moved = executeTool(placed.document, call("moveItem", { itemId: id, constraints: { rotateDeg: 45 } }), ctx());
    expect(moved.changed).toBe(true);
    expect(moved.document.furniture[0]!.rotationY).not.toBe(before);
    expect(SceneDocumentSchema.safeParse(moved.document).success).toBe(true);
  });

  it("moveItem reports item_not_found for a bad id", () => {
    const res = executeTool(docWithRoom(), call("moveItem", { itemId: "nope", constraints: {} }), ctx());
    expect(res.resultForLLM).toMatchObject({ ok: false, error: "item_not_found" });
  });

  it("removeItem deletes the item (and is schema-valid)", () => {
    const doc = docWithRoom();
    const placed = executeTool(doc, call("placeFurniture", { catalogId: "armchair-birch" }), ctx());
    const id = placed.document.furniture[0]!.id;
    const removed = executeTool(placed.document, call("removeItem", { itemId: id }), ctx());
    expect(removed.document.furniture).toHaveLength(0);
    expect(SceneDocumentSchema.safeParse(removed.document).success).toBe(true);
  });

  it("setTimeOfDay upserts the sun light", () => {
    const res = executeTool(docWithRoom(), call("setTimeOfDay", { time: "19:30", date: "2026-07-23" }), ctx());
    expect(res.document.view.timeOfDay).toBe("2026-07-23T19:30:00");
    expect(SceneDocumentSchema.safeParse(res.document).success).toBe(true);
  });

  it("toggleLamp creates then toggles a lamp for a furniture item", () => {
    const doc = docWithRoom();
    const placed = executeTool(doc, call("placeFurniture", { catalogId: "lighting-floor-arc", constraints: { nearWall: true } }), ctx());
    const id = placed.document.furniture[0]!.id;
    const on = executeTool(placed.document, call("toggleLamp", { itemId: id, on: true }), ctx());
    const lamp = on.document.lights.find((l) => l.furnitureItemId === id);
    expect(lamp).toMatchObject({ furnitureItemId: id, on: true, kind: "table" });
    const off = executeTool(on.document, call("toggleLamp", { itemId: id, on: false }), ctx());
    expect(off.document.lights.find((l) => l.furnitureItemId === id)).toMatchObject({ on: false });
  });

  it("querySpace returns facts without mutating", () => {
    const doc = docWithRoom();
    const res = executeTool(doc, call("querySpace", {}), ctx());
    expect(res.changed).toBe(false);
    expect(res.document).toBe(doc);
    expect(res.resultForLLM).toMatchObject({ ok: true });
    const facts = res.resultForLLM as { room: { floorAreaM2: number } };
    expect(facts.room.floorAreaM2).toBeCloseTo(20, 1);
  });

  it("suggestLayout places a collision-free set and stays schema-valid", () => {
    const doc = docWithRoom();
    const res = executeTool(doc, call("suggestLayout", { style: "cozy", budget: 3000 }), ctx());
    expect(res.changed).toBe(true);
    expect(res.document.furniture.length).toBeGreaterThan(0);
    expect(SceneDocumentSchema.safeParse(res.document).success).toBe(true);
    expect(res.resultForLLM).toMatchObject({ ok: true });
  });
});
