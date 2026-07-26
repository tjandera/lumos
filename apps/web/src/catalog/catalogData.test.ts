import { afterEach, describe, expect, it } from "vitest";
import { CATALOG, getCatalogItem, getLiveCatalog, reconcileCatalog, resetLiveCatalog, type CatalogItem } from "./catalogData";

describe("modelUrl plumbing", () => {
  it("the seed catalog's coffee-table carries a modelUrl pointing at a public GLB path", () => {
    const item = getCatalogItem("coffee-table");
    expect(item?.modelUrl).toBe("/models/test-box.glb");
  });

  it("items with no modelUrl leave it undefined (primitive fallback path)", () => {
    const item = getCatalogItem("dining-chair");
    expect(item?.modelUrl).toBeUndefined();
  });

  it("reconcileCatalog carries an API item's modelUrl through untouched", () => {
    const apiItem: CatalogItem = {
      id: "api-with-model",
      name: "API Sofa",
      category: "sofa",
      dimensions: { w: 2, d: 1, h: 0.8 },
      price: 999,
      color: "#123456",
      modelUrl: "https://cdn.example.com/models/api-sofa.glb"
    };
    reconcileCatalog([apiItem]);
    expect(getCatalogItem("api-with-model")?.modelUrl).toBe("https://cdn.example.com/models/api-sofa.glb");
    resetLiveCatalog();
  });
});

afterEach(() => {
  resetLiveCatalog();
});

describe("live catalog reconciliation", () => {
  it("starts as the static seed catalog, tagged as static", () => {
    const live = getLiveCatalog();
    expect(live).toHaveLength(CATALOG.length);
    expect(live.every((item) => item.source === "static")).toBe(true);
  });

  it("API item with the same id as a static item overrides it (API wins)", () => {
    const staticItem = CATALOG[0] as CatalogItem;
    const apiOverride: CatalogItem = {
      ...staticItem,
      name: "Renamed from API",
      price: 12345,
      description: "fresh from the server"
    };

    reconcileCatalog([apiOverride]);

    const resolved = getCatalogItem(staticItem.id);
    expect(resolved?.name).toBe("Renamed from API");
    expect(resolved?.price).toBe(12345);
    expect(resolved?.source).toBe("api");
    // Total count unchanged — it was a merge by id, not an append.
    expect(getLiveCatalog()).toHaveLength(CATALOG.length);
  });

  it("API items with new ids are appended alongside the static catalog", () => {
    const apiOnly: CatalogItem = {
      id: "api-only-rug",
      name: "Handwoven Rug",
      category: "rug",
      dimensions: { w: 2, d: 1.4, h: 0.02 },
      price: 199,
      color: "#a33",
      description: "An API-only item with no static counterpart."
    };

    reconcileCatalog([apiOnly]);

    expect(getLiveCatalog()).toHaveLength(CATALOG.length + 1);
    expect(getCatalogItem("api-only-rug")).toMatchObject({ name: "Handwoven Rug", source: "api" });
  });

  it("static items with no API counterpart are kept (offline fallback)", () => {
    reconcileCatalog([]); // API reachable but returned nothing relevant / empty
    expect(getLiveCatalog()).toHaveLength(CATALOG.length);
    for (const item of CATALOG) {
      expect(getCatalogItem(item.id)).toBeDefined();
    }
  });

  it("reconciling twice replaces rather than accumulates stale API items", () => {
    const first: CatalogItem = {
      id: "api-a",
      name: "A",
      category: "misc",
      dimensions: { w: 1, d: 1, h: 1 },
      price: 1,
      color: "#000"
    };
    const second: CatalogItem = {
      id: "api-b",
      name: "B",
      category: "misc",
      dimensions: { w: 1, d: 1, h: 1 },
      price: 2,
      color: "#111"
    };

    reconcileCatalog([first]);
    expect(getCatalogItem("api-a")).toBeDefined();

    reconcileCatalog([second]);
    expect(getCatalogItem("api-a")).toBeUndefined();
    expect(getCatalogItem("api-b")).toBeDefined();
  });

  it("resetLiveCatalog restores the static-only state", () => {
    reconcileCatalog([{ id: "temp", name: "Temp", category: "misc", dimensions: { w: 1, d: 1, h: 1 }, price: 1, color: "#fff" }]);
    resetLiveCatalog();
    expect(getLiveCatalog()).toHaveLength(CATALOG.length);
    expect(getCatalogItem("temp")).toBeUndefined();
  });
});
