import { describe, expect, it } from "vitest";
import { addFurniture, createEmptyDocument, moveFurniture, removeFurniture } from "./document.js";
import type { FurnitureItem } from "./types.js";

function makeItem(overrides: Partial<FurnitureItem> = {}): FurnitureItem {
  return {
    id: "sofa-1",
    catalogId: "catalog-sofa-basic",
    position: { x: 0, y: 0, z: 0 },
    rotationY: 0,
    dimensions: { w: 2, d: 1, h: 0.8 },
    ...overrides
  };
}

describe("createEmptyDocument", () => {
  it("creates a document with no rooms, furniture, or lights", () => {
    const doc = createEmptyDocument("My Apartment", "doc-1");

    expect(doc.meta.id).toBe("doc-1");
    expect(doc.meta.name).toBe("My Apartment");
    expect(doc.rooms).toEqual([]);
    expect(doc.furniture).toEqual([]);
    expect(doc.lights).toEqual([]);
    expect(doc.meta.createdAt).toBe(doc.meta.updatedAt);
  });

  it("emits a current-version (v2) document with a default site", () => {
    const doc = createEmptyDocument("Sited", "doc-2");
    expect(doc.schemaVersion).toBe(2);
    expect(doc.site).toEqual({ lat: 51.5074, lng: -0.1278, trueNorthOffsetDeg: 0 });
  });

  it("defaults to an auto-generated id and name", () => {
    const doc = createEmptyDocument();
    expect(doc.meta.name).toBe("Untitled design");
    expect(typeof doc.meta.id).toBe("string");
    expect(doc.meta.id.length).toBeGreaterThan(0);
  });
});

describe("addFurniture", () => {
  it("appends a furniture item and returns a new document", () => {
    const doc = createEmptyDocument("Test", "doc-1");
    const item = makeItem();

    const next = addFurniture(doc, item);

    expect(next).not.toBe(doc);
    expect(next.furniture).toHaveLength(1);
    expect(next.furniture[0]).toEqual(item);
    expect(doc.furniture).toHaveLength(0);
  });

  it("bumps updatedAt", async () => {
    const doc = createEmptyDocument("Test", "doc-1");
    await new Promise((resolve) => setTimeout(resolve, 2));

    const next = addFurniture(doc, makeItem());

    expect(next.meta.updatedAt).not.toBe(doc.meta.updatedAt);
  });

  it("throws when adding a duplicate id", () => {
    const doc = addFurniture(createEmptyDocument("Test", "doc-1"), makeItem());

    expect(() => addFurniture(doc, makeItem())).toThrow(/already exists/);
  });
});

describe("moveFurniture", () => {
  it("updates position of an existing item", () => {
    const doc = addFurniture(createEmptyDocument("Test", "doc-1"), makeItem());

    const next = moveFurniture(doc, "sofa-1", { position: { x: 5, y: 0, z: 3 } });

    expect(next.furniture[0]?.position).toEqual({ x: 5, y: 0, z: 3 });
    expect(next.furniture[0]?.rotationY).toBe(0);
  });

  it("updates rotation independently of position", () => {
    const doc = addFurniture(createEmptyDocument("Test", "doc-1"), makeItem());

    const next = moveFurniture(doc, "sofa-1", { rotationY: Math.PI / 2 });

    expect(next.furniture[0]?.rotationY).toBeCloseTo(Math.PI / 2);
    expect(next.furniture[0]?.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("does not mutate the original document", () => {
    const doc = addFurniture(createEmptyDocument("Test", "doc-1"), makeItem());

    moveFurniture(doc, "sofa-1", { position: { x: 9, y: 0, z: 9 } });

    expect(doc.furniture[0]?.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("throws when the item does not exist", () => {
    const doc = createEmptyDocument("Test", "doc-1");

    expect(() => moveFurniture(doc, "missing", { rotationY: 1 })).toThrow(/not found/);
  });
});

describe("removeFurniture", () => {
  it("removes the item with the given id", () => {
    const doc = addFurniture(createEmptyDocument("Test", "doc-1"), makeItem());

    const next = removeFurniture(doc, "sofa-1");

    expect(next.furniture).toHaveLength(0);
  });

  it("leaves other items untouched", () => {
    let doc = createEmptyDocument("Test", "doc-1");
    doc = addFurniture(doc, makeItem({ id: "a" }));
    doc = addFurniture(doc, makeItem({ id: "b" }));

    const next = removeFurniture(doc, "a");

    expect(next.furniture.map((item) => item.id)).toEqual(["b"]);
  });

  it("throws when the item does not exist", () => {
    const doc = createEmptyDocument("Test", "doc-1");

    expect(() => removeFurniture(doc, "missing")).toThrow(/not found/);
  });
});
