import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { materializeRoomPhoto } from '@interior/core';
import { analyzeRoomPhoto, RoomPhotoConfigError, RoomPhotoUpstreamError } from './openai';

const AnalyzeBodySchema = z.object({
  imageDataUrl: z
    .string()
    .startsWith('data:image/', 'imageDataUrl must be a data: URL (e.g. from FileReader.readAsDataURL)'),
});

export interface AppConfig {
  apiKey: string | undefined;
  model: string;
  mock: boolean;
}

/** Builds the Fastify instance without binding a port, so tests can exercise routes via
 * `.inject()`. Config is passed in rather than read from `process.env` directly, so tests
 * don't need to touch real env vars. */
export function buildApp(config: AppConfig): FastifyInstance {
  // No CORS plugin: apps/web's Vite dev server proxies /api/* to this server (see
  // apps/web/vite.config.ts), so browser requests are same-origin in dev. A real
  // deployment would serve both from one origin/reverse-proxy too.
  const app = Fastify({ bodyLimit: 20 * 1024 * 1024 }); // base64 photos inflate ~33% over their file size

  app.get('/status', async () => ({
    available: config.mock || Boolean(config.apiKey),
    mock: config.mock,
  }));

  app.post('/analyze-room-photo', async (request, reply) => {
    const body = AnalyzeBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Invalid request body' });
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
      return reply.code(500).send({ error: 'Unexpected server error' });
    }
  });

  return app;
}
