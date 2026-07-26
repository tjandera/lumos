import { describe, it, expect } from 'vitest';
import { buildApp } from './app';
const IMAGE = 'data:image/png;base64,iVBORw0KGgo=';
describe('GET /status', () => {
    it('reports unavailable when there is no key and mock mode is off', async () => {
        const app = buildApp({ apiKey: undefined, model: 'gpt-4o', mock: false });
        const res = await app.inject({ method: 'GET', url: '/status' });
        expect(res.json()).toEqual({ available: false, mock: false });
    });
    it('reports available in mock mode even without a key', async () => {
        const app = buildApp({ apiKey: undefined, model: 'gpt-4o', mock: true });
        const res = await app.inject({ method: 'GET', url: '/status' });
        expect(res.json()).toEqual({ available: true, mock: true });
    });
});
describe('POST /analyze-room-photo', () => {
    it('rejects a body that is not a data: URL', async () => {
        const app = buildApp({ apiKey: undefined, model: 'gpt-4o', mock: true });
        const res = await app.inject({ method: 'POST', url: '/analyze-room-photo', payload: { imageDataUrl: 'not-a-data-url' } });
        expect(res.statusCode).toBe(400);
    });
    it('returns 503 when the server has no API key configured and mock mode is off', async () => {
        const app = buildApp({ apiKey: undefined, model: 'gpt-4o', mock: false });
        const res = await app.inject({ method: 'POST', url: '/analyze-room-photo', payload: { imageDataUrl: IMAGE } });
        expect(res.statusCode).toBe(503);
    });
    it('returns a materialized SceneDocument in mock mode', async () => {
        const app = buildApp({ apiKey: undefined, model: 'gpt-4o', mock: true });
        const res = await app.inject({ method: 'POST', url: '/analyze-room-photo', payload: { imageDataUrl: IMAGE } });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.doc.rooms).toHaveLength(1);
        expect(body.doc.furniture.length).toBeGreaterThan(0);
        expect(Array.isArray(body.skippedFurnitureCategories)).toBe(true);
    });
});
//# sourceMappingURL=app.test.js.map