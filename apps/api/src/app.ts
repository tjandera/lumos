import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { ChatProvider } from "@interior/ai";
import { catalogRoutes } from "./catalog/routes.js";
import { catalogItems } from "./catalog/data.js";
import { designRoutes } from "./designs/routes.js";
import { FileDesignStorage } from "./designs/fileStorage.js";
import { PostgresDesignStorage } from "./designs/postgresStorage.js";
import type { DesignStorage } from "./designs/storage.js";
import { FileOwnershipStore } from "./designs/ownership.js";
import { PostgresOwnershipStore } from "./designs/postgresOwnershipStore.js";
import type { OwnershipStore } from "./designs/ownership.js";
import { shareRoutes } from "./share/routes.js";
import { FileShareTokenStore } from "./share/tokenStore.js";
import { PostgresShareTokenStore } from "./share/postgresTokenStore.js";
import type { ShareTokenStore } from "./share/tokenStore.js";
import { registerSession, resolveSessionSecret } from "./auth/session.js";
import { aiRoutes } from "./ai/routes.js";
import { createRateLimiter, type RateLimitOptions } from "./ai/rateLimit.js";
import { buildAiProvider, isFeatureAiEnabled } from "./ai/provider.js";
import { createPgPool, ensurePgSchema, pingPgPool, type PgPool } from "./db/pool.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export const defaultDataDir = path.join(here, "..", "data", "designs");

export interface BuildAppOptions {
  /** Directory to persist design JSON files in. Defaults to apps/api/data/designs. */
  dataDir?: string;
  /** Vite dev origin(s) to allow via CORS. */
  corsOrigin?: string | string[];
  logger?: boolean;
  storage?: DesignStorage;
  /** Override the ownership store (tests). Defaults to a file store under `dataDir`. */
  ownership?: OwnershipStore;
  /** Override the share-token store (tests). Defaults to a file store under `dataDir`. */
  tokens?: ShareTokenStore;
  /**
   * Postgres connection string. Defaults to `process.env.DATABASE_URL`. When
   * set (and `storage`/`ownership`/`tokens` aren't individually overridden),
   * designs/ownership/share-tokens persist to Postgres instead of the
   * file-backed JSON stores - see `db/pool.ts` for the connection pooling
   * and schema bootstrap.
   */
  databaseUrl?: string;
  /**
   * Inject a pre-built `pg.Pool` directly instead of creating one from
   * `databaseUrl` (tests use a pg-mem-backed pool here). When provided, the
   * pool's lifecycle is owned by the caller - `buildApp` will not `end()`
   * it on `app.close()`.
   */
  pgPool?: PgPool;
  /** Override `SESSION_SECRET` (tests). Defaults to the env-driven `resolveSessionSecret()`. */
  sessionSecret?: string;
  /** Override the `FEATURE_AI` env flag (tests). */
  featureAi?: boolean;
  /** Override the chat provider (tests use `MockProvider`). Defaults to env-driven selection. */
  aiProvider?: ChatProvider;
  /** Override the AI route's rate-limit window/max (tests). */
  aiRateLimit?: RateLimitOptions;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  await app.register(cors, {
    origin: options.corsOrigin ?? process.env.VITE_ORIGIN ?? "http://localhost:5173",
    // The session cookie (anonymous ownership) and share-link management
    // both ride on cookies, which fetch() only sends/receives cross-origin
    // when both the client passes `credentials: "include"` AND the server
    // echoes back a specific (non-wildcard) origin with this flag set.
    credentials: true
  });

  // Anonymous-ownership session: must be registered directly on the
  // top-level `app` (not via app.register(fn)) so its onRequest hook and
  // `request.ownerId` decoration apply to every route below, including ones
  // registered in their own plugin scopes (designRoutes, shareRoutes, ...).
  await registerSession(app, { secret: options.sessionSecret ?? resolveSessionSecret() });

  // Storage backend selection: an injected pool wins (tests), then
  // `databaseUrl`/`DATABASE_URL` selects Postgres, else fall back to the
  // file-backed JSON stores (the default, unchanged behavior).
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  const ownsPool = !options.pgPool && !!databaseUrl;
  const pgPool = options.pgPool ?? (databaseUrl ? createPgPool(databaseUrl) : undefined);

  if (pgPool) {
    try {
      await pingPgPool(pgPool);
      await ensurePgSchema(pgPool);
    } catch (err) {
      // Don't leak the pool we just created if startup fails before the
      // `onClose` hook below gets a chance to register.
      if (ownsPool) await pgPool.end().catch(() => {});
      throw err;
    }
  }

  const storage =
    options.storage ?? (pgPool ? new PostgresDesignStorage(pgPool) : new FileDesignStorage(options.dataDir ?? defaultDataDir));
  const ownership =
    options.ownership ?? (pgPool ? new PostgresOwnershipStore(pgPool) : new FileOwnershipStore(options.dataDir ?? defaultDataDir));
  const tokens =
    options.tokens ?? (pgPool ? new PostgresShareTokenStore(pgPool) : new FileShareTokenStore(options.dataDir ?? defaultDataDir));

  // Graceful shutdown: close the pool we created (not one injected by a
  // caller/test, which owns its own lifecycle) when the Fastify instance
  // closes, so `app.close()` / SIGTERM doesn't leak connections.
  if (pgPool && ownsPool) {
    app.addHook("onClose", async () => {
      await pgPool.end();
    });
  }

  app.get("/health", async () => {
    return { ok: true };
  });

  await app.register(catalogRoutes);
  await app.register(designRoutes, { storage, ownership, tokens });
  await app.register(shareRoutes, { storage, tokens });

  const featureAi = options.featureAi ?? isFeatureAiEnabled();
  if (featureAi) {
    const provider = options.aiProvider ?? buildAiProvider();
    const checkRateLimit = createRateLimiter(options.aiRateLimit);
    await app.register(aiRoutes, { provider, catalog: catalogItems, checkRateLimit });
  }

  return app;
}
