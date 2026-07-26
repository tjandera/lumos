import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { materializeRoomPhoto } from "@interior/core";
import { analyzeRoomPhoto, RoomPhotoConfigError, RoomPhotoUpstreamError } from "./openai.js";

export interface RoomPhotoConfig {
  apiKey: string | undefined;
  model: string;
  /** Return a canned proposal instead of calling the vision model — for local
   * development and tests, so exercising the import flow costs nothing. */
  mock: boolean;
}

const AnalyzeBodySchema = z.object({
  imageDataUrl: z
    .string()
    .startsWith("data:image/", "imageDataUrl must be a data: URL (e.g. from FileReader.readAsDataURL)")
});

/**
 * Photo -> 3D room import. The vision model only ever returns a constrained, zod-validated
 * `RoomPhotoProposal`; `materializeRoomPhoto` (pure, in core) is what actually builds the
 * document — clamping every dimension and re-resolving overlaps. Same golden rule as the
 * rest of the AI surface: the model proposes, deterministic code places and validates.
 */
export async function roomPhotoRoutes(
  app: FastifyInstance,
  opts: { config: RoomPhotoConfig }
): Promise<void> {
  const { config } = opts;

  app.get("/room-photo/status", async () => ({
    available: config.mock || Boolean(config.apiKey),
    mock: config.mock
  }));

  app.post("/room-photo/analyze", async (request, reply) => {
    const body = AnalyzeBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? "Invalid request body" });
    }

    try {
      const proposal = await analyzeRoomPhoto(body.data.imageDataUrl, config);
      const { doc, skippedFurnitureCategories, notes } = materializeRoomPhoto(proposal);
      return reply.send({ doc, skippedFurnitureCategories, notes });
    } catch (err) {
      if (err instanceof RoomPhotoConfigError) {
        return reply.code(503).send({ error: err.message });
      }
      if (err instanceof RoomPhotoUpstreamError) {
        return reply.code(502).send({ error: err.message });
      }
      request.log.error(err);
      return reply.code(500).send({ error: "Unexpected server error" });
    }
  });
}
