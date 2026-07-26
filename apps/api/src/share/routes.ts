/**
 * Public share-viewer endpoint. Deliberately unauthenticated (no cookie/auth
 * check) and deliberately minimal: resolves a token to a design id, then
 * returns the plain `SceneDocument` from storage. There is no owner info to
 * strip here because ownership is never part of the document in the first
 * place - it lives in a separate `OwnershipStore` keyed by design id
 * (`designs/ownership.ts`), so a shared document can never leak who owns it.
 */
import type { FastifyInstance } from "fastify";
import type { DesignStorage } from "../designs/storage.js";
import type { ShareTokenStore } from "./tokenStore.js";

export interface ShareRoutesOptions {
  storage: DesignStorage;
  tokens: ShareTokenStore;
}

const INVALID_LINK_MESSAGE = "This link is invalid or was revoked.";

export async function shareRoutes(app: FastifyInstance, options: ShareRoutesOptions): Promise<void> {
  const { storage, tokens } = options;

  app.get<{ Params: { token: string } }>("/share/:token", async (request, reply) => {
    const designId = await tokens.resolve(request.params.token);
    if (!designId) {
      reply.code(404);
      return { error: INVALID_LINK_MESSAGE };
    }

    const doc = await storage.get(designId);
    if (!doc) {
      // Design was deleted but a stale token entry lingered somehow - treat
      // identically to "revoked" rather than leaking a 500/other detail.
      reply.code(404);
      return { error: INVALID_LINK_MESSAGE };
    }

    return doc;
  });
}
