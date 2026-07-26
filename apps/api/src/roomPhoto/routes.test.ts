import { describe, it, expect } from 'vitest';
import { buildApp } from '../app.js';

const IMAGE = 'data:image/png;base64,iVBORw0KGgo=';

/** Room-photo import needs none of the persistence stack, so these build the app with
 * file storage pointed at a throwaway dir and the AI feature off — keeping the test
 * about the photo routes and nothing else. */
async function appWith(roomPhoto: { apiKey: string | undefined; model: string; mock: boolean }) {
  return buildApp({
    roomPhoto,
    featureAi: false,
    logger: false,
    dataDir: `/tmp/interior-test-${Math.random().toString(36).slice(2)}`,
  });
}

describe('GET /room-photo/status', () => {
  it('reports unavailable when there is no key and mock mode is off', async () => {
    const app = await appWith({ apiKey: undefined, model: 'gpt-5.6', mock: false });
    const res = await app.inject({ method: 'GET', url: '/room-photo/status' });
    expect(res.json()).toEqual({ available: false, mock: false });
    await app.close();
  });

  it('reports available in mock mode even without a key', async () => {
    const app = await appWith({ apiKey: undefined, model: 'gpt-5.6', mock: true });
    const res = await app.inject({ method: 'GET', url: '/room-photo/status' });
    expect(res.json()).toEqual({ available: true, mock: true });
    await app.close();
  });
});

describe('POST /room-photo/analyze', () => {
  it('rejects a body that is not a data: URL', async () => {
    const app = await appWith({ apiKey: undefined, model: 'gpt-5.6', mock: true });
    const res = await app.inject({
      method: 'POST',
      url: '/room-photo/analyze',
      payload: { imageDataUrl: 'not-a-data-url' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 503 when the server has no API key configured and mock mode is off', async () => {
    const app = await appWith({ apiKey: undefined, model: 'gpt-5.6', mock: false });
    const res = await app.inject({ method: 'POST', url: '/room-photo/analyze', payload: { imageDataUrl: IMAGE } });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('returns a materialized SceneDocument in mock mode', async () => {
    const app = await appWith({ apiKey: undefined, model: 'gpt-5.6', mock: true });
    const res = await app.inject({ method: 'POST', url: '/room-photo/analyze', payload: { imageDataUrl: IMAGE } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.doc.rooms).toHaveLength(1);
    expect(body.doc.furniture.length).toBeGreaterThan(0);
    // v6: identity lives in meta, and the materializer stamps it.
    expect(body.doc.meta.id).toBeTruthy();
    expect(Array.isArray(body.skippedFurnitureCategories)).toBe(true);
    await app.close();
  });
});
