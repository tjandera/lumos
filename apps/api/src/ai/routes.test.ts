import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { MockProvider } from "@interior/ai";
import { createEmptyDocument, type Room, type SceneDocument } from "@interior/core";
import { buildApp } from "../app.js";

/** A rectangular 5m x 4m room, so solver-backed tools (suggestLayout, placeFurniture) have somewhere to place items. */
function testRoom(): Room {
  return {
    id: "room-1",
    name: "Living Room",
    walls: [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 4 },
      { x: 0, y: 4 }
    ],
    wallThickness: 0.1,
    height: 2.5,
    openings: []
  };
}

function docWithRoom(): SceneDocument {
  return { ...createEmptyDocument("Test"), rooms: [testRoom()] };
}

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

async function parseSse(body: string): Promise<unknown[]> {
  return body
    .split("\n\n")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith("data:"))
    .map((chunk) => JSON.parse(chunk.slice(5).trim()));
}

describe("POST /ai/chat", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("404s when FEATURE_AI is off", async () => {
    app = await buildApp({ logger: false, storage: unusedStorage(), featureAi: false });
    const res = await app.inject({
      method: "POST",
      url: "/ai/chat",
      payload: { document: createEmptyDocument(), userMessage: "hello" }
    });
    expect(res.statusCode).toBe(404);
  });

  it("streams a TurnEvent SSE sequence ending in `done` with MockProvider", async () => {
    app = await buildApp({
      logger: false,
      storage: unusedStorage(),
      featureAi: true,
      aiProvider: new MockProvider()
    });

    const res = await app.inject({
      method: "POST",
      url: "/ai/chat",
      payload: { document: docWithRoom(), userMessage: "Suggest a cozy living-room layout" }
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");

    const events = await parseSse(res.body);
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => (e as { type: string }).type === "toolCallStart")).toBe(true);
    expect(events.some((e) => (e as { type: string }).type === "documentChanged")).toBe(true);
    const last = events.at(-1) as { type: string; document?: unknown };
    expect(last.type).toBe("done");
    expect(last.document).toBeTruthy();
  });

  it("rejects a request with no userMessage", async () => {
    app = await buildApp({
      logger: false,
      storage: unusedStorage(),
      featureAi: true,
      aiProvider: new MockProvider()
    });
    const res = await app.inject({
      method: "POST",
      url: "/ai/chat",
      payload: { document: createEmptyDocument() }
    });
    expect(res.statusCode).toBe(400);
  });

  it("429s once the per-IP rate limit is exceeded", async () => {
    app = await buildApp({
      logger: false,
      storage: unusedStorage(),
      featureAi: true,
      aiProvider: new MockProvider(),
      aiRateLimit: { windowMs: 60_000, max: 1 }
    });

    const payload = { document: createEmptyDocument(), userMessage: "hi" };
    const first = await app.inject({ method: "POST", url: "/ai/chat", payload });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({ method: "POST", url: "/ai/chat", payload });
    expect(second.statusCode).toBe(429);
  });

  it("grounds a shopping question in the catalog via querySpace + suggestLayout tool loop", async () => {
    app = await buildApp({
      logger: false,
      storage: unusedStorage(),
      featureAi: true,
      aiProvider: new MockProvider()
    });

    const res = await app.inject({
      method: "POST",
      url: "/ai/chat",
      payload: { document: docWithRoom(), userMessage: "What sofa fits here under $500?" }
    });

    expect(res.statusCode).toBe(200);
    const events = await parseSse(res.body);
    const toolResults = events.filter((e) => (e as { type: string }).type === "toolResult") as {
      type: string;
      toolName: string;
      result: unknown;
    }[];
    // The heuristic MockProvider answers space/fit questions via querySpace,
    // grounding the answer in real room/catalog facts rather than inventing one.
    expect(toolResults.some((r) => r.toolName === "querySpace")).toBe(true);
  });
});
