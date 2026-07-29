import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { decodeDataUrl, isLightPresetId, LIGHT_PRESET_IDS, LightStudyUpstreamError } from './openai.js';

/** A 1x1 transparent PNG — small, valid, and enough to exercise the whole round trip. */
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('decodeDataUrl', () => {
  it('splits a base64 image data URL into mime and payload', () => {
    const { mime, base64 } = decodeDataUrl(TINY_PNG);
    expect(mime).toBe('image/png');
    expect(base64.startsWith('iVBORw0KGgo')).toBe(true);
  });

  it('rejects anything that is not a base64 image data URL', () => {
    for (const bad of ['https://example.com/a.png', 'data:text/plain;base64,aGk=', 'not a url']) {
      expect(() => decodeDataUrl(bad)).toThrow(LightStudyUpstreamError);
    }
  });
});

describe('isLightPresetId', () => {
  it('accepts the published presets and rejects anything else', () => {
    for (const id of LIGHT_PRESET_IDS) expect(isLightPresetId(id)).toBe(true);
    expect(isLightPresetId('midnight')).toBe(false);
    expect(isLightPresetId('__proto__')).toBe(false); // prototype keys must not sneak through
  });
});

describe('light study routes', () => {
  let app: FastifyInstance;
  afterEach(async () => {
    await app?.close();
  });

  describe('with no key and no mock', () => {
    beforeEach(async () => {
      app = await buildApp({
        logger: false,
        lightStudy: { apiKey: undefined, imageModel: 'gpt-image-1', mock: false },
      });
    });

    it('reports itself unavailable rather than pretending', async () => {
      const res = await app.inject({ method: 'GET', url: '/light-study/status' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ available: false, mock: false });
    });

    it('still lists the presets, so the UI can render them greyed out', async () => {
      const body = await app.inject({ method: 'GET', url: '/light-study/status' }).then((r) => r.json());
      expect(body.presets.map((p: { id: string }) => p.id)).toEqual(LIGHT_PRESET_IDS);
    });

    it('answers 503 (not configured) rather than 500 when asked to relight', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/light-study/relight',
        payload: { frameDataUrl: TINY_PNG, preset: 'golden' },
      });
      expect(res.statusCode).toBe(503);
      expect(res.json().error).toMatch(/OPENAI_API_KEY/);
    });
  });

  describe('in mock mode', () => {
    beforeEach(async () => {
      app = await buildApp({
        logger: false,
        lightStudy: { apiKey: undefined, imageModel: 'gpt-image-1', mock: true },
      });
    });

    it('reports available', async () => {
      expect((await app.inject({ method: 'GET', url: '/light-study/status' })).json()).toMatchObject({
        available: true,
        mock: true,
      });
    });

    it('round-trips a frame without calling any model', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/light-study/relight',
        payload: { frameDataUrl: TINY_PNG, preset: 'dusk' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.preset).toBe('dusk');
      expect(body.mock).toBe(true);
      expect(body.imageDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    });

    it('rejects an unknown preset with a helpful message', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/light-study/relight',
        payload: { frameDataUrl: TINY_PNG, preset: 'midnight' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/preset must be one of/);
    });

    it('rejects a non-image payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/light-study/relight',
        payload: { frameDataUrl: 'https://example.com/room.png', preset: 'noon' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects a body missing fields entirely', async () => {
      const res = await app.inject({ method: 'POST', url: '/light-study/relight', payload: {} });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('rate limiting', () => {
    beforeEach(async () => {
      app = await buildApp({
        logger: false,
        lightStudy: { apiKey: undefined, imageModel: 'gpt-image-1', mock: true },
        lightStudyRateLimit: { windowMs: 60_000, max: 2 },
      });
    });

    it('429s once the budget is spent — image generation is the priciest call here', async () => {
      const call = () =>
        app.inject({ method: 'POST', url: '/light-study/relight', payload: { frameDataUrl: TINY_PNG, preset: 'noon' } });
      expect((await call()).statusCode).toBe(200);
      expect((await call()).statusCode).toBe(200);
      const third = await call();
      expect(third.statusCode).toBe(429);
      expect(third.json().error).toMatch(/Too many requests/);
    });
  });
});
