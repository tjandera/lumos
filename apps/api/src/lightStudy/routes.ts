import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RateLimitCheck } from '../ai/rateLimit.js';
import {
  relightFrame,
  isLightPresetId,
  LIGHT_PRESETS,
  LIGHT_PRESET_IDS,
  LightStudyConfigError,
  LightStudyUpstreamError,
  type LightStudyConfig,
} from './openai.js';

/**
 * Frames arrive as base64 data URLs, so the body is large by nature. Fastify's default
 * 1MB body limit would reject a full-resolution capture outright; this route opts into
 * a bigger one rather than silently degrading the image the client sends.
 */
const MAX_BODY_BYTES = 12 * 1024 * 1024;

const RelightBodySchema = z.object({
  frameDataUrl: z.string().startsWith('data:image/', 'frameDataUrl must be an image data: URL'),
  preset: z.string().refine(isLightPresetId, {
    message: `preset must be one of: ${LIGHT_PRESET_IDS.join(', ')}`,
  }),
});

/**
 * Photoreal re-lighting of a captured light-study frame.
 *
 * The accurate day cycle is produced entirely client-side by the real renderer; this
 * endpoint is the optional styling pass on top, which is why the whole feature degrades
 * to "unavailable" rather than breaking when no key is configured.
 */
export async function lightStudyRoutes(
  app: FastifyInstance,
  opts: { config: LightStudyConfig; checkRateLimit?: RateLimitCheck },
): Promise<void> {
  const { config, checkRateLimit } = opts;

  app.get('/light-study/status', async () => ({
    available: config.mock || Boolean(config.apiKey),
    mock: config.mock,
    presets: LIGHT_PRESET_IDS.map((id) => ({ id, label: LIGHT_PRESETS[id].label })),
  }));

  app.post('/light-study/relight', { bodyLimit: MAX_BODY_BYTES }, async (request, reply) => {
    // Image generation is the most expensive thing this server can be asked to do, so
    // it's rate-limited on the same basis as the AI proxy.
    if (checkRateLimit && !(await checkRateLimit(request.ip))) {
      return reply.code(429).send({ error: 'Too many requests — try again shortly.' });
    }

    const body = RelightBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Invalid request body' });
    }

    try {
      const imageDataUrl = await relightFrame(body.data.frameDataUrl, body.data.preset, config);
      return reply.send({ imageDataUrl, preset: body.data.preset, mock: config.mock });
    } catch (err) {
      if (err instanceof LightStudyConfigError) {
        return reply.code(503).send({ error: err.message });
      }
      if (err instanceof LightStudyUpstreamError) {
        // The sanitiser picks the status: a rejected key is our misconfiguration (503),
        // a rate limit is 429, an OpenAI outage is 502.
        return reply.code(err.httpStatus).send({ error: err.message });
      }
      request.log.error(err);
      return reply.code(500).send({ error: 'Unexpected server error' });
    }
  });
}
