/**
 * POST /ai/chat — server-side proxy for the AI assistant.
 *
 * Only registered when `FEATURE_AI` is enabled (see `app.ts`); when it
 * isn't, the route simply doesn't exist and requests 404 — no runtime
 * branching inside the handler needed.
 *
 * Runs `runTurn` (from `@interior/ai`) against the configured provider and
 * the live catalog, and streams the resulting `TurnEvent`s to the client as
 * Server-Sent Events (one JSON-encoded event per `data:` line). The web app
 * applies `documentChanged`/`done` events to its own store — this route
 * never touches design storage.
 */

import type { FastifyInstance } from "fastify";
import { runTurn, type ChatMessage, type ChatProvider } from "@interior/ai";
import type { CatalogItem } from "../catalog/types.js";
import { migrateSceneDocument } from "../designs/validate.js";
import type { RateLimitCheck } from "./rateLimit.js";

export interface AiRoutesOptions {
  provider: ChatProvider;
  catalog: CatalogItem[];
  checkRateLimit: RateLimitCheck;
}

interface ChatRequestBody {
  document: unknown;
  messages?: ChatMessage[];
  userMessage: string;
  roomId?: string;
}

export async function aiRoutes(app: FastifyInstance, options: AiRoutesOptions): Promise<void> {
  const { provider, catalog, checkRateLimit } = options;

  app.post<{ Body: ChatRequestBody }>("/ai/chat", async (request, reply) => {
    if (!(await checkRateLimit(request.ip))) {
      reply.code(429);
      return { error: "rate_limited", message: "Too many AI requests — please wait a moment and try again." };
    }

    const body = request.body;
    if (!body || typeof body.userMessage !== "string" || body.userMessage.trim() === "") {
      reply.code(400);
      return { error: "invalid_request", message: "userMessage is required" };
    }

    const migrated = migrateSceneDocument(body.document);
    if (!migrated.ok) {
      reply.code(400);
      return { error: "invalid_document", details: migrated.errors };
    }

    const history = Array.isArray(body.messages) ? body.messages : [];

    const currentHeaders = reply.getHeaders() as import("node:http").OutgoingHttpHeaders;
    reply.hijack();
    reply.raw.writeHead(200, {
      ...currentHeaders,
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    });

    try {
      const options: { history: ChatMessage[]; roomId?: string } = { history };
      if (body.roomId) options.roomId = body.roomId;
      for await (const event of runTurn(provider, migrated.doc, catalog, body.userMessage, options)) {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI request failed";
      reply.raw.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
    } finally {
      reply.raw.end();
    }

    return reply;
  });
}
