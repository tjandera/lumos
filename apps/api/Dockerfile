# apps/api Dockerfile — multi-stage, pnpm-workspace-aware.
#
# Build context MUST be the monorepo root (not apps/api), because this app
# consumes @interior/core and @interior/ai as built workspace packages
# (NodeNext resolution against their `dist/`, per the root README). Build
# with:
#   docker build -f apps/api/Dockerfile -t interior-api .
# (docker-compose.yml at the repo root already sets this up.)
#
# NOTE: not runtime-verified in this sandbox (no Docker daemon available) —
# reviewed carefully by hand instead. See IMPLEMENTATION_PLAN.md verification
# notes / the delivering agent's report for details.

# syntax=docker/dockerfile:1.7

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate
WORKDIR /app

# ---- fetch: populate pnpm's content-addressable store from the lockfile
# alone, so this layer only invalidates when pnpm-lock.yaml changes (no
# source, no manifests yet — those go in the next stage for finer caching).
FROM base AS fetch
COPY pnpm-lock.yaml ./
RUN pnpm fetch

# ---- build: offline install (strictly from the fetched store) against just
# the workspace manifests, then bring in source and build only the packages
# @interior/api needs (core, ai) plus the api itself. `pnpm prune --prod`
# drops devDependencies from node_modules in place afterward.
FROM base AS build
COPY --from=fetch /pnpm /pnpm
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/renderer/package.json packages/renderer/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --offline --frozen-lockfile
COPY packages/core packages/core
COPY packages/ai packages/ai
COPY apps/api apps/api
RUN pnpm --filter @interior/core --filter @interior/ai --filter @interior/api build \
  && pnpm prune --prod

# ---- runtime: distroless-ish slim image, non-root user, only what's needed
# to run `node apps/api/dist/index.js`.
FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app

RUN groupadd --system appgroup \
  && useradd --system --gid appgroup --create-home --home-dir /home/appuser appuser

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/packages/core ./packages/core
COPY --from=build /app/packages/ai ./packages/ai
COPY --from=build /app/apps/api ./apps/api

# Default design-storage directory (see apps/api/src/app.ts `defaultDataDir`,
# resolved relative to the built dist dir at apps/api/dist/../data/designs).
# docker-compose mounts a named volume here.
RUN mkdir -p /app/apps/api/data/designs && chown -R appuser:appgroup /app

USER appuser
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3001)+'/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "apps/api/dist/index.js"]
