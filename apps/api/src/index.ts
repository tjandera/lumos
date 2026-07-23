import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 3001);

buildApp()
  .then(async (app) => {
    await app.listen({ port, host: "0.0.0.0" });

    // Graceful shutdown: closing the Fastify instance runs its `onClose`
    // hooks, which includes ending the Postgres pool (see app.ts) when
    // DATABASE_URL is set - avoids leaking connections on redeploy/restart.
    const shutdown = (signal: string) => {
      app.log.info(`${signal} received, shutting down`);
      app
        .close()
        .then(() => process.exit(0))
        .catch((err) => {
          app.log.error(err);
          process.exit(1);
        });
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  })
  .catch((err) => {
    // Covers both listen() failures and buildApp()'s startup Postgres ping
    // (see db/pool.ts `pingPgPool`) - either way, fail fast with a clear
    // message rather than starting in a broken state.
    console.error("Failed to start API server:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
