import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { imageDayRoutes } from './routes.js';
import { buildImagePrompt } from './openai.js';
import { dayMoments } from '@interior/core';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
const LONDON = { lat: 51.5, lng: -0.13, trueNorthOffsetDeg: 0, date: '2026-06-21' };

async function build(overrides: Partial<Parameters<typeof imageDayRoutes>[1]['config']> = {}) {
  const app = Fastify({ logger: false });
  await app.register(imageDayRoutes, {
    config: { mock: true, visionModel: 'v', imageModel: 'i', ...overrides },
  });
  return app;
}

describe('image-day routes', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('reports availability and the configured image model', async () => {
    app = await build();
    const res = await app.inject({ method: 'GET', url: '/image-day/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ available: true, mock: true, imageModel: 'i' });
    // A full 24h cycle, night through evening twilight.
    expect(res.json().moments).toHaveLength(12);
    expect(res.json().moments).toContain('night');
    expect(res.json().moments).toContain('sunrise');
  });

  it('is unavailable, but does not error, with no key and no mock', async () => {
    app = await build({ mock: false, apiKey: undefined });
    const res = await app.inject({ method: 'GET', url: '/image-day/status' });
    expect(res.json()).toMatchObject({ available: false, mock: false });
  });

  it('returns the real schedule for a place and date without generating anything', async () => {
    app = await build();
    const res = await app.inject({ method: 'POST', url: '/image-day/schedule', payload: LONDON });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.kind).toBe('normal');
    expect(body.moments).toHaveLength(12);
    // London midsummer: the sun genuinely is up before 4am solar time.
    expect(body.sunriseMinutes).toBeLessThan(5 * 60);
  });

  it('generates one moment and echoes which one it was', async () => {
    app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/image-day/generate',
      payload: { imageDataUrl: PNG, moment: 'goldenHour', site: LONDON },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.moment.id).toBe('goldenHour');
    expect(body.imageDataUrl).toMatch(/^data:image\//);
    expect(body.mock).toBe(true);
  });

  it('rejects a non-image payload', async () => {
    app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/image-day/generate',
      payload: { imageDataUrl: 'https://example.com/x.png', moment: 'midday', site: LONDON },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/data: URL/);
  });

  it('rejects an unknown moment rather than silently picking one', async () => {
    app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/image-day/generate',
      payload: { imageDataUrl: PNG, moment: 'teatime', site: LONDON },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an out-of-range latitude', async () => {
    app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/image-day/generate',
      payload: { imageDataUrl: PNG, moment: 'midday', site: { ...LONDON, lat: 120 } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('503s when generation is asked for with no key configured', async () => {
    app = await build({ mock: false, apiKey: undefined });
    const res = await app.inject({
      method: 'POST',
      url: '/image-day/generate',
      payload: { imageDataUrl: PNG, moment: 'midday', site: LONDON },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toMatch(/OPENAI_API_KEY/);
  });

  it('429s past the rate limit instead of running up a bill', async () => {
    const app2 = Fastify({ logger: false });
    let calls = 0;
    await app2.register(imageDayRoutes, {
      config: { mock: true, visionModel: 'v', imageModel: 'i' },
      checkRateLimit: () => ++calls <= 1,
    });
    app = app2;
    const payload = { imageDataUrl: PNG, moment: 'midday', site: LONDON };
    expect((await app.inject({ method: 'POST', url: '/image-day/generate', payload })).statusCode).toBe(200);
    const second = await app.inject({ method: 'POST', url: '/image-day/generate', payload });
    expect(second.statusCode).toBe(429);
  });

  it('analyzes a photo and returns the five context fields', async () => {
    app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/image-day/analyze',
      payload: { imageDataUrl: PNG },
    });
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json().context).sort()).toEqual([
      'cameraView',
      'lamps',
      'materials',
      'roomType',
      'windows',
    ]);
  });
});

describe('buildImagePrompt', () => {
  const context = {
    roomType: 'living room',
    windows: 'one tall window on the left wall',
    materials: 'oak floor, white walls, grey sofa',
    lamps: 'a floor lamp beside the sofa',
    cameraView: 'eye level from the doorway',
  };
  const { moments } = dayMoments(LONDON.lat, LONDON.lng, new Date('2026-06-21'));
  const midday = moments.find((m) => m.id === 'midday')!;
  const dusk = moments.find((m) => m.id === 'dusk')!;

  it('carries every piece of room context into the prompt', () => {
    const p = buildImagePrompt(midday, context);
    for (const v of Object.values(context)) expect(p).toContain(v);
  });

  it('states the physical sun angle, not just a mood word', () => {
    const p = buildImagePrompt(midday, context);
    expect(p).toMatch(/Sun altitude \d+°/);
    expect(p).toMatch(/bearing \d+°/);
  });

  it('forbids redecorating — the whole point of an edit over a generation', () => {
    const p = buildImagePrompt(midday, context);
    expect(p).toMatch(/Identical camera position/i);
    expect(p).toMatch(/Do not add, remove, move/i);
  });

  it('rules out sunbeams after dark instead of leaving it to inference', () => {
    const p = buildImagePrompt(dusk, context);
    expect(p).toMatch(/below the horizon/i);
    expect(p).toMatch(/No sunbeams/i);
  });

  it('mentions the date so the season is not left to chance', () => {
    expect(buildImagePrompt(midday, context, { dateLabel: '2026-06-21' })).toContain('2026-06-21');
  });

  it('calls out midnight sun and polar night when they apply', () => {
    expect(buildImagePrompt(midday, context, { polar: 'polarDay' })).toMatch(/midnight sun/i);
    expect(buildImagePrompt(dusk, context, { polar: 'polarNight' })).toMatch(/polar night/i);
  });
});
