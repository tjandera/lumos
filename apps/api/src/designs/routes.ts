import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { createEmptyDocument } from "@interior/core";
import type { DesignStorage, DesignSummary } from "./storage.js";
import type { OwnershipStore } from "./ownership.js";
import type { ShareTokenStore } from "../share/tokenStore.js";
import { migrateSceneDocument } from "./validate.js";

export interface DesignRoutesOptions {
  storage: DesignStorage;
  ownership: OwnershipStore;
  tokens: ShareTokenStore;
}

/**
 * True if `requesterId` may read/mutate a design owned by `ownerId`.
 * `ownerId === undefined` means the design predates ownership tracking (or
 * was created outside the owned routes) - treated as unowned/claimable by
 * anyone, per the migration-lite policy documented in `ownership.ts`.
 */
function canAccess(ownerId: string | undefined, requesterId: string): boolean {
  return ownerId === undefined || ownerId === requesterId;
}

export async function designRoutes(app: FastifyInstance, options: DesignRoutesOptions): Promise<void> {
  const { storage, ownership, tokens } = options;

  app.get("/designs", async (request) => {
    const all = await storage.list();
    const owned: DesignSummary[] = [];
    for (const summary of all) {
      const ownerId = await ownership.getOwner(summary.id);
      // List scoping is intentionally strict (unlike get/put's claim-on-write
      // leniency): an unowned legacy design does not show up in anyone's
      // list until it's actually claimed via a PUT.
      if (ownerId === request.ownerId) owned.push(summary);
    }
    return { designs: owned };
  });

  app.get<{ Params: { id: string } }>("/designs/:id", async (request, reply) => {
    const doc = await storage.get(request.params.id);
    if (!doc) {
      reply.code(404);
      return { error: "Design not found" };
    }

    const ownerId = await ownership.getOwner(doc.meta.id);
    if (!canAccess(ownerId, request.ownerId)) {
      reply.code(403);
      return { error: "Forbidden" };
    }

    return doc;
  });

  app.post<{ Body: unknown }>("/designs", async (request, reply) => {
    const body = request.body;

    // Convenience path: `{ "name": "..." }` (or an empty body) creates a
    // fresh empty design, matching the previous in-memory stub's behavior.
    if (!isFullDocumentShape(body)) {
      const name = isObject(body) && typeof body.name === "string" ? body.name : "Untitled design";
      const doc = createEmptyDocument(name);
      await storage.save(doc);
      await ownership.setOwner(doc.meta.id, request.ownerId);
      reply.code(201);
      return doc;
    }

    // Accept a v1 (unversioned) or v2 document; store the migrated v2 form.
    const result = migrateSceneDocument(body);
    if (!result.ok) {
      reply.code(400);
      return { error: "Invalid design document", details: result.errors };
    }

    const doc = result.doc;
    // A POST always creates a new design: assign a fresh id even if the
    // client supplied one, so re-saving a fetched doc doesn't collide.
    const now = new Date().toISOString();
    const created = {
      ...doc,
      meta: { ...doc.meta, id: randomUUID(), createdAt: now, updatedAt: now }
    };
    await storage.save(created);
    await ownership.setOwner(created.meta.id, request.ownerId);
    reply.code(201);
    return created;
  });

  app.put<{ Params: { id: string }; Body: unknown }>("/designs/:id", async (request, reply) => {
    const existing = await storage.get(request.params.id);
    if (!existing) {
      reply.code(404);
      return { error: "Design not found" };
    }

    const ownerId = await ownership.getOwner(existing.meta.id);
    if (!canAccess(ownerId, request.ownerId)) {
      reply.code(403);
      return { error: "Forbidden" };
    }

    // Accept a v1 (unversioned) or v2 document; store the migrated v2 form.
    const result = migrateSceneDocument(request.body);
    if (!result.ok) {
      reply.code(400);
      return { error: "Invalid design document", details: result.errors };
    }

    const doc = result.doc;
    const updated = {
      ...doc,
      meta: { ...doc.meta, id: request.params.id, updatedAt: new Date().toISOString() }
    };
    await storage.save(updated);

    // Migration-lite: a design with no recorded owner is claimed by whoever
    // successfully PUTs it first.
    if (ownerId === undefined) {
      await ownership.setOwner(request.params.id, request.ownerId);
    }

    return updated;
  });

  app.delete<{ Params: { id: string } }>("/designs/:id", async (request, reply) => {
    const existing = await storage.get(request.params.id);
    if (!existing) {
      reply.code(404);
      return { error: "Design not found" };
    }

    const ownerId = await ownership.getOwner(existing.meta.id);
    if (!canAccess(ownerId, request.ownerId)) {
      reply.code(403);
      return { error: "Forbidden" };
    }

    const deleted = await storage.delete(request.params.id);
    if (!deleted) {
      reply.code(404);
      return { error: "Design not found" };
    }
    await ownership.deleteOwner(request.params.id);
    await tokens.revokeForDesign(request.params.id);
    reply.code(204);
    return null;
  });

  // --- Share link management (owner only). The public read side lives at
  // GET /share/:token in ../share/routes.ts, registered with no auth. ---

  app.post<{ Params: { id: string } }>("/designs/:id/share", async (request, reply) => {
    const existing = await storage.get(request.params.id);
    if (!existing) {
      reply.code(404);
      return { error: "Design not found" };
    }

    const ownerId = await ownership.getOwner(existing.meta.id);
    if (!canAccess(ownerId, request.ownerId)) {
      reply.code(403);
      return { error: "Forbidden" };
    }
    if (ownerId === undefined) {
      await ownership.setOwner(request.params.id, request.ownerId);
    }

    const token = await tokens.createToken(request.params.id);
    reply.code(201);
    return { token };
  });

  app.delete<{ Params: { id: string } }>("/designs/:id/share", async (request, reply) => {
    const existing = await storage.get(request.params.id);
    if (!existing) {
      reply.code(404);
      return { error: "Design not found" };
    }

    const ownerId = await ownership.getOwner(existing.meta.id);
    if (!canAccess(ownerId, request.ownerId)) {
      reply.code(403);
      return { error: "Forbidden" };
    }

    await tokens.revokeForDesign(request.params.id);
    reply.code(204);
    return null;
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True if the body looks like it's trying to be a full SceneDocument (has rooms/furniture/lights arrays) rather than just `{ name }`. */
function isFullDocumentShape(value: unknown): value is Record<string, unknown> {
  return isObject(value) && ("rooms" in value || "furniture" in value || "lights" in value || "meta" in value);
}
