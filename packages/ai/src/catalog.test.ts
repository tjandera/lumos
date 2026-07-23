import { describe, expect, it } from "vitest";
import { filterCatalog, findCatalogItem, needsFrontClearance } from "./catalog.js";
import { testCatalog } from "./test-fixtures.js";

describe("filterCatalog (DB-filter half of shopping)", () => {
  it("filters by category", () => {
    const sofas = filterCatalog(testCatalog, { category: "sofa" });
    expect(sofas.every((i) => i.category === "sofa")).toBe(true);
    expect(sofas.length).toBeGreaterThan(0);
  });

  it("filters by fits-in-space max dimensions", () => {
    const small = filterCatalog(testCatalog, { maxWidth: 1.0 });
    expect(small.every((i) => i.dimensions.w <= 1.0)).toBe(true);
    expect(small.some((i) => i.id === "storage-huge-wall")).toBe(false);
  });

  it("filters by per-item price ceiling", () => {
    const cheap = filterCatalog(testCatalog, { maxPrice: 300 });
    expect(cheap.every((i) => i.price <= 300)).toBe(true);
  });

  it("treats invalid numeric bounds as no filter", () => {
    expect(filterCatalog(testCatalog, { maxWidth: -5 })).toHaveLength(testCatalog.length);
  });

  it("finds items by id", () => {
    expect(findCatalogItem(testCatalog, "sofa-oslo-3seat")?.name).toContain("Sofa");
    expect(findCatalogItem(testCatalog, "missing")).toBeUndefined();
  });
});

describe("needsFrontClearance", () => {
  it("is true for seating and beds, false otherwise", () => {
    expect(needsFrontClearance("sofa")).toBe(true);
    expect(needsFrontClearance("armchair")).toBe(true);
    expect(needsFrontClearance("bed")).toBe(true);
    expect(needsFrontClearance("table")).toBe(false);
    expect(needsFrontClearance("storage")).toBe(false);
  });
});
