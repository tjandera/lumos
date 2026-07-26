import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { catalogItems } from "./data.js";

describe("catalog routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false, storage: unusedStorage() });
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /catalog returns all items", async () => {
    const res = await app.inject({ method: "GET", url: "/catalog" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(catalogItems.length);
  });

  it("filters by category", async () => {
    const res = await app.inject({ method: "GET", url: "/catalog?category=sofa" });
    const body = res.json();
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((item: { category: string }) => item.category === "sofa")).toBe(true);
  });

  it("filters by name search, case-insensitive", async () => {
    const res = await app.inject({ method: "GET", url: "/catalog?q=oslo" });
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("sofa-oslo-3seat");
  });

  it("filters by maxWidth/maxDepth/maxHeight (fits-in-space)", async () => {
    const res = await app.inject({ method: "GET", url: "/catalog?maxWidth=0.5&maxDepth=0.5&maxHeight=1.7" });
    const body = res.json();
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(item.dimensions.w).toBeLessThanOrEqual(0.5);
      expect(item.dimensions.d).toBeLessThanOrEqual(0.5);
      expect(item.dimensions.h).toBeLessThanOrEqual(1.7);
    }
  });

  it("combines filters", async () => {
    const res = await app.inject({ method: "GET", url: "/catalog?category=chair&maxWidth=0.5" });
    const body = res.json();
    expect(body.items.every((item: { category: string }) => item.category === "chair")).toBe(true);
  });

  it("returns an empty array when no items match", async () => {
    const res = await app.inject({ method: "GET", url: "/catalog?q=nonexistent-item-xyz" });
    expect(res.json().items).toEqual([]);
  });

  it("GET /catalog/:id returns a single item", async () => {
    const res = await app.inject({ method: "GET", url: "/catalog/sofa-oslo-3seat" });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe("sofa-oslo-3seat");
  });

  it("GET /catalog/:id 404s for an unknown id", async () => {
    const res = await app.inject({ method: "GET", url: "/catalog/does-not-exist" });
    expect(res.statusCode).toBe(404);
  });
});

// The catalog routes never touch storage; provide a stub so buildApp doesn't
// need a real data directory for these tests.
function unusedStorage() {
  return {
    async list() {
      return [];
    },
    async get() {
      return undefined;
    },
    async save() {
      /* noop */
    },
    async delete() {
      return false;
    }
  };
}
