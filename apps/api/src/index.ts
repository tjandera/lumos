import { buildApp } from './app';

try {
  // Node 20.6+/22 built-in — no dotenv dependency needed. Fine if there's no .env
  // (e.g. a deployment that injects real env vars directly).
  process.loadEnvFile();
} catch {
  // no .env file — that's fine, env vars may already be set another way
}

const PORT = Number(process.env.PORT) || 8787;
const MOCK = process.env.ROOM_PHOTO_MOCK === 'true';

const app = buildApp({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || 'gpt-4o',
  mock: MOCK,
});

app
  .listen({ port: PORT, host: '127.0.0.1' })
  .then(() => {
    console.log(`[api] listening on http://127.0.0.1:${PORT}${MOCK ? ' (ROOM_PHOTO_MOCK on)' : ''}`);
  })
  .catch((err) => {
    console.error('[api] failed to start', err);
    process.exit(1);
  });
