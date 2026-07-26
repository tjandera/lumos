import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
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
import type { RateLimitOptions } from "./ai/rateLimit.js";
import { createPgPool, ensurePgSchema, pingPgPool, type PgPool } from "./db/pool.js";
import { roomPhotoRoutes, type RoomPhotoConfig } from "./roomPhoto/routes.js";

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
  /** Structurally typed so this module doesn't have to import @interior/ai — see the
   * lazy-load note on the AI block below. */
  aiProvider?: unknown;
  /** Override the AI route's rate-limit window/max (tests). */
  aiRateLimit?: RateLimitOptions;
  /**
   * Photo -> 3D room import (vision model proposes, `materializeRoomPhoto` places).
   * Omitted in tests that don't exercise it; the routes still register and report
   * themselves unavailable via `/room-photo/status`.
   */
  roomPhoto?: RoomPhotoConfig;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true, bodyLimit: 20 * 1024 * 1024 });

  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow any local origin, or fallback to configured origin
      if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        cb(null, true);
        return;
      }
      cb(null, options.corsOrigin ?? process.env.VITE_ORIGIN ?? "http://localhost:5173");
    },
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
  await app.register(roomPhotoRoutes, {
    config: options.roomPhoto ?? { apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL ?? "gpt-5.6", mock: process.env.ROOM_PHOTO_MOCK === "true" }
  });
  await app.register(designRoutes, { storage, ownership, tokens });
  await app.register(shareRoutes, { storage, tokens });

  // The assistant is loaded lazily, and only when it's actually switched on. Keeping it
  // off the module's static import graph means the whole persistence API (designs, auth,
  // share links, catalog, photo import) builds, boots and is testable without
  // @interior/ai being present or built at all.
  const featureAi = options.featureAi ?? (process.env.FEATURE_AI ?? "true") !== "false";
  let provider: unknown;
  let providerKind: "mock" | "llm" | null = null;
  if (featureAi) {
    if (options.aiProvider) {
      provider = options.aiProvider;
    } else {
      try {
        const { buildAiProvider } = await import("./ai/provider.js");
        provider = buildAiProvider();
      } catch (err) {
        // The assistant is genuinely optional: a missing/unbuilt @interior/ai must not
        // take the whole API down with it. Say so loudly, then serve everything else.
        // `/ai/status` will report `enabled: true, provider: null` — "switched on but
        // unavailable" — which is distinguishable from "switched off".
        app.log.warn(
          { err: err instanceof Error ? err.message : err },
          "FEATURE_AI is on but @interior/ai could not be loaded — assistant routes disabled"
        );
      }
    }
    if (provider) {
      providerKind = (provider as { constructor: { name: string } })?.constructor.name === "MockProvider" ? "mock" : "llm";
    }
  }

  // `/ai/status` is always registered (regardless of the flag) so the web
  // app can tell "assistant off" apart from "assistant on, offline mock"
  // apart from "assistant on, real LLM" without probing `/ai/chat` itself.
  app.get("/ai/status", async () => {
    return { enabled: featureAi, provider: providerKind };
  });
  if (featureAi && provider) {
    const [{ aiRoutes }, { createRateLimiter }] = await Promise.all([
      import("./ai/routes.js"),
      import("./ai/rateLimit.js")
    ]);
    const checkRateLimit = createRateLimiter(options.aiRateLimit);
    await app.register(aiRoutes as never, { provider, catalog: catalogItems, checkRateLimit } as never);
  }

  return app;
}
