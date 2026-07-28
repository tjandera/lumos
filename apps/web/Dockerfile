# apps/web Dockerfile — static Vite build served by nginx.
#
# Build context MUST be the monorepo root (workspace deps @interior/core,
# @interior/ai, @interior/renderer are built from source). Build with:
#   docker build -f apps/web/Dockerfile -t interior-web \
#     --build-arg VITE_API_URL=http://localhost:3001 .
# (docker-compose.yml at the repo root already sets this up.)
#
# VITE_API_URL / VITE_FEATURE_AI are Vite *build-time* env vars (see
# apps/web/src/api/client.ts, apps/web/src/flags/features.ts) — they get
# baked into the static bundle, so they must be passed as `--build-arg`, not
# just as container env vars at `docker run` time.

# syntax=docker/dockerfile:1.7

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate
WORKDIR /app

FROM base AS fetch
COPY pnpm-lock.yaml ./
RUN pnpm fetch

FROM base AS build
COPY --from=fetch /pnpm /pnpm
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/renderer/package.json packages/renderer/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --offline --frozen-lockfile
COPY packages packages
COPY apps/web apps/web

ARG VITE_API_URL=http://localhost:3001
ARG VITE_FEATURE_AI=false
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_FEATURE_AI=${VITE_FEATURE_AI}

RUN pnpm --filter @interior/core --filter @interior/ai --filter @interior/renderer build \
  && pnpm --filter @interior/web build

# ---- runtime: nginx serving the static build output.
FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
