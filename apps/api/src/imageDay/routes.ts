import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dayMoments, DAY_MOMENT_IDS, type DayMomentId } from '@interior/core';
import type { RateLimitCheck } from '../ai/rateLimit.js';
import {
  analyzeRoom,
  generateMoment,
  ImageDayConfigError,
  ImageDayUpstreamError,
  type ImageDayConfig,
  type RoomLightContext,
} from './openai.js';

/**
 * Photos are base64 data URLs and can be large straight off a phone camera; the default
 * 1MB Fastify limit would reject them outright.
 */
const MAX_BODY_BYTES = 16 * 1024 * 1024;

const contextSchema = z.object({
  roomType: z.string(),
  windows: z.string(),
  materials: z.string(),
  lamps: z.string(),
  cameraView: z.string(),
});

const siteSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  trueNorthOffsetDeg: z.number().default(0),
  /** ISO date; the day whose sun is being simulated. */
  date: z.string().datetime({ offset: true }).or(z.string().date()),
});

const analyzeSchema = z.object({
  imageDataUrl: z.string().startsWith('data:image/', 'imageDataUrl must be an image data: URL'),
});

const generateSchema = z.object({
  imageDataUrl: z.string().startsWith('data:image/', 'imageDataUrl must be an image data: URL'),
  moment: z.enum(DAY_MOMENT_IDS as unknown as [DayMomentId, ...DayMomentId[]]),
  site: siteSchema,
  /** From /image-day/analyze. Optional — omitting it just means a generic description. */
  context: contextSchema.optional(),
});

/**
 * "Image Generation Day": a user's own room photo, shown under the daylight it will
 * actually get at different hours.
 *
 * One moment per request rather than a batch endpoint. Each image takes ~35s, so a
 * six-image timelapse held open as a single request would sit far past most proxy
 * timeouts and give the user nothing until the very end. Driving the sequence from the
 * client instead means frames appear as they finish, a failure costs one moment rather
 * than the run, and the existing per-IP rate limiter applies per image.
 */
export async function imageDayRoutes(
  app: FastifyInstance,
  opts: { config: ImageDayConfig; checkRateLimit?: RateLimitCheck },
): Promise<void> {
  const { config, checkRateLimit } = opts;

  app.get('/image-day/status', async () => ({
    available: config.mock || Boolean(config.apiKey),
    mock: config.mock,
    moments: DAY_MOMENT_IDS,
    imageModel: config.imageModel,
  }));

  app.post('/image-day/analyze', { bodyLimit: MAX_BODY_BYTES }, async (request, reply) => {
    if (checkRateLimit && !checkRateLimit(request.ip)) {
      return reply.code(429).send({ error: 'Too many requests — try again shortly.' });
    }
    const body = analyzeSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Invalid request body' });
    }
    try {
      const context = await analyzeRoom(body.data.imageDataUrl, config);
      return { context };
    } catch (err) {
      if (err instanceof ImageDayConfigError) return reply.code(503).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Analysis failed' });
    }
  });

  app.post('/image-day/generate', { bodyLimit: MAX_BODY_BYTES }, async (request, reply) => {
    if (checkRateLimit && !checkRateLimit(request.ip)) {
      return reply.code(429).send({ error: 'Too many requests — try again shortly.' });
    }
    const body = generateSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Invalid request body' });
    }

    const { site, moment: momentId, context, imageDataUrl } = body.data;
    const date = new Date(site.date);
    if (Number.isNaN(date.getTime())) {
      return reply.code(400).send({ error: 'site.date is not a valid date' });
    }

    const set = dayMoments(site.lat, site.lng, date, site.trueNorthOffsetDeg);
    const moment = set.moments.find((m) => m.id === momentId);
    if (!moment) return reply.code(400).send({ error: `Unknown moment: ${momentId}` });

    const fallbackContext: RoomLightContext = context ?? {
      roomType: 'interior room',
      windows: 'window position as shown in the photograph',
      materials: 'surfaces and finishes exactly as shown',
      lamps: 'any lamps visible in the photograph',
      cameraView: 'the exact camera position and framing of the photograph',
    };

    try {
      const imageUrl = await generateMoment(imageDataUrl, moment, fallbackContext, config, {
        dateLabel: date.toISOString().slice(0, 10),
        polar: set.kind === 'normal' ? undefined : set.kind,
      });
      return { imageDataUrl: imageUrl, moment, mock: config.mock };
    } catch (err) {
      if (err instanceof ImageDayConfigError) return reply.code(503).send({ error: err.message });
      if (err instanceof ImageDayUpstreamError) return reply.code(502).send({ error: err.message });
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Generation failed' });
    }
  });

  /** The schedule alone, so the UI can show real times before spending anything. */
  app.post('/image-day/schedule', async (request, reply) => {
    const body = siteSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Invalid request body' });
    }
    const date = new Date(body.data.date);
    if (Number.isNaN(date.getTime())) return reply.code(400).send({ error: 'date is not valid' });
    return dayMoments(body.data.lat, body.data.lng, date, body.data.trueNorthOffsetDeg);
  });
}
