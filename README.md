# 3D Property Interior Design

Arrange furniture in a 3D model of a home with realistic light & shadow before you buy.
See `IMPLEMENTATION_PLAN.md` for scope and phases, and `CLAUDE.md` for conventions.

## Status

**Phases 0–4 complete** — the MVP feature set: draw → furnish → light → arrange.

- **Phase 0 (foundation):** scene-document model (zod schema + versioned migrations),
  a renderer that turns it into 3D, and an app shell with orbit camera, patch-based
  undo, and a perf-budget HUD.
- **Phase 1 (floor plan → 3D):** walls extruded with real window/door openings
  (Shape-with-holes), a dollhouse **cutaway** view, WebGL context-loss handling + error
  telemetry, and a **2D floor-plan editor** (draw/reshape walls, place openings, edit
  dimensions — every change undoable and reflected live in 3D).
- **Phase 2 (furniture):** a shared catalog package, **add / drag / rotate / delete**
  furniture, **AABB collision** detection with live red highlighting in both views, and
  **localStorage save/load** (autosaves; validated + migrated on load).
- **Phase 3 (lighting):** real sun position from `suncalc` (unit-tested `sunVector`), a
  **time-of-day slider** that moves the sun and shadows live, a procedural sky, and
  altitude-driven light color/intensity.
- **Phase 4 (AI assistant, behind `FEATURE_AI`):** a deterministic, clearance-validated
  **auto-layout** engine ("Suggest a layout") — the LLM proposes intent, code places and
  validates. Natural-language commands are wired but gated on an API key + backend.

**Phase 5 (ship) is what remains**, and it needs external resources: a backend
(Fastify) for share links + accounts, hosting for deployment, real licensed GLB models,
and an LLM key + proxy for live natural-language commands.

## Prerequisites

- Node.js >= 22
- pnpm >= 11 (`corepack enable`, or `npm i -g pnpm`)

## Run it

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173 — you'll see the sample room. Drag to orbit; toggle **3D / Plan**
(top-left) to switch between the 3D view (with a **Cutaway** dollhouse toggle) and the 2D
floor-plan editor, where you can reshape walls and add windows/doors. **Add furniture**
from the catalog (bottom-left) and drag/rotate it in Plan mode — overlaps highlight red.
Your design **autosaves** to the browser (**Reset** restores the sample). Scrub the
**Time of day** slider to watch the sun and shadows move. With `VITE_FEATURE_AI=true`
(see `apps/web/.env.local`), the **AI assistant** can "Suggest a layout". **Undo/Redo**
works across everything; the perf HUD (top-right) tracks FPS, draw calls, and triangles.

## Other commands

```bash
pnpm test        # unit tests (Vitest): schema, migrations, undo
pnpm typecheck   # typecheck every package
pnpm build       # production build of the web app
```

## Structure

- `packages/core` — `SceneDocument` schema, migrations, undo, feature flags (pure TS)
- `packages/renderer` — react-three-fiber rendering of a `SceneDocument`
- `apps/web` — Vite + React + Tailwind app shell + perf HUD
- `catalog/` — furniture catalog manifest + licensing

---

# Merged notes from the launchpad codebase (Darlene)

# interior-app

Arrange furniture in a 3D model of a room, with real-world sun/shadow, before you buy. Draw a floor plan, drop in catalog furniture, scrub time-of-day to see how daylight moves across the room, and share a read-only link.

## Architecture

```
apps/web            React + Vite + react-three-fiber viewer (Plan editor, 3D scene, onboarding, perf/quality)
apps/api            Fastify: catalog, design storage, AI chat proxy, share links
packages/core       Scene document model — zod schema + migrations, pure TS, no three.js
packages/renderer   three.js/R3F rendering + lighting rig (reads packages/core)
packages/ai         LLM tool-calling layer, behind FEATURE_AI/VITE_FEATURE_AI (no three.js, no React)
```

The scene document (`SceneDocument` in `packages/core`) is the contract: plain serializable JSON, versioned (`schemaVersion` + migrations), meters/Y-up. The renderer and the AI layer both just read/write it — the AI only ever calls typed tools derived from the same `zod` schema, never emits raw coordinates. Home address (if any) never enters the document; only coarse lat/lng + a true-north offset do, so shared links can't leak it.

Undo/redo is Immer-patch-based (not full-document snapshots), scoped per-store-action in `apps/web/src/store/sceneStore.ts`.

## Getting started (local dev)

```
pnpm install
pnpm dev        # run all dev servers (web on :5173, api on :3001)
pnpm build      # build all packages/apps
pnpm test       # run unit tests
pnpm typecheck  # typecheck all workspaces
pnpm lint       # lint all workspaces
```

`packages/ai` and `apps/api`/`apps/web` are consumed via built `dist/` output (NodeNext module resolution), so run `pnpm build` (or at least `pnpm --filter @interior/core --filter @interior/ai build`) before `pnpm dev`/`typecheck` if you're working from a clean checkout — `turbo` handles this automatically for `pnpm dev`/`build`/`test`/`typecheck` via the `^build` pipeline dependency.

## Getting started (Docker)

Requires Docker + Docker Compose. From the repo root:

```
docker compose up --build
```

- Web (nginx, static build): http://localhost:8080
- API (Fastify): http://localhost:3001

By default `docker compose up` also starts a `postgres:16` service and the API connects to it (`DATABASE_URL` is wired automatically — see "Storage backends" below), persisting in the `postgres-data` named volume. The `designs-data` volume (file-backed storage) still exists for the fallback case (`DATABASE_URL=` blank in `.env`). Override any setting via a gitignored `.env` file next to `docker-compose.yml` (see the env var table below) — e.g. the AI assistant is on by default (offline mock), but to turn it off:

```
echo "FEATURE_AI=false" >> .env
docker compose up --build
```

`apps/api/Dockerfile` and `apps/web/Dockerfile` both build from the **repo root** as context (they need the workspace packages `@interior/core`/`@interior/ai`/`@interior/renderer`), are multi-stage (pnpm fetch → offline install → build → prune/nginx), run as a non-root user, and declare a `HEALTHCHECK` — the API's hits `/health`, the web image's does a plain root request against nginx.

> **Note:** Docker builds are not runtime-verified in the environment these images were authored in (no Docker daemon available there) — they were reviewed carefully by hand instead. Run `docker compose up --build` yourself before relying on this in production, and treat it as the first thing to check if something's off.

## Environment variables

| Variable | Used by | Default | Notes |
| --- | --- | --- | --- |
| `PORT` | api | `3001` | HTTP port the Fastify server listens on. |
| `VITE_ORIGIN` | api | `http://localhost:5173` (dev) / `http://localhost:8080` (compose) | CORS allow-origin for the API. |
| `FEATURE_AI` | api | `true` | On by default — registers `POST /ai/chat` and `GET /ai/status`. Set to `false`/`0` to explicitly disable (`/ai/chat` 404s; `/ai/status` still responds with `{enabled:false,provider:null}`). See "AI assistant" below. |
| `AI_PROVIDER_BASE_URL` | api | unset | OpenAI-compatible endpoint (OpenAI, Azure, vLLM, LiteLLM, Ollama's shim, ...). With this unset, the assistant runs against the built-in offline `MockProvider` — a real LLM always requires this (+ `AI_MODEL`) explicitly. |
| `AI_MODEL` | api | unset | Model name for `AI_PROVIDER_BASE_URL`. Required together with it. |
| `AI_PROVIDER_API_KEY` | api | unset | Optional; omit for keyless local servers. |
| `SESSION_SECRET` | api | unset | Signing secret for the lightweight session/auth layer backing design ownership (Phase 5a). Set a real random value in any non-local deployment. |
| `DATABASE_URL` | api | unset | Postgres connection string (e.g. `postgresql://user:pass@host:5432/db`). When set, designs/ownership/share-tokens persist to Postgres instead of the file-backed JSON store; unset (default) keeps the file-backed store. See "Storage backends" below. |
| `VITE_API_URL` | web (build-time) | `http://localhost:3001` | Baked into the static bundle at build time — the browser's base URL for API calls. For Docker, pass as `--build-arg` / the compose `args:` block, not a runtime env var (a already-built static bundle can't read container env at `docker run` time). |
| `VITE_FEATURE_AI` | web (build-time) | `true` | Shows/hides the AI "Assistant" drawer. On by default; set to `false`/`0` to hide it. Build-time — both this and the API's `FEATURE_AI` need to stay enabled for the assistant to work end-to-end. |
| `API_PORT` / `WEB_PORT` | docker-compose | `3001` / `8080` | Host-side published ports. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | docker-compose | `interior` / `interior` / `interior` | Credentials/db name for the bundled `postgres:16` compose service; also used to build the default `DATABASE_URL` the `api` service connects with. |

## Storage backends

`apps/api`'s designs/ownership/share-token persistence sits behind three small interfaces (`DesignStorage`, `OwnershipStore`, `ShareTokenStore` — see `apps/api/src/designs/storage.ts`, `designs/ownership.ts`, `share/tokenStore.ts`) with two implementations each:

- **File-backed (default).** One JSON file per design (`designs/fileStorage.ts`) plus `owners.json`/`shares.json` maps, all under `apps/api/data/designs` (or `dataDir`), with atomic (temp-file + rename) writes. Zero setup — this is what runs when `DATABASE_URL` is unset.
- **Postgres (`designs/postgresStorage.ts`, `designs/postgresOwnershipStore.ts`, `share/postgresTokenStore.ts`).** Selected automatically when `DATABASE_URL` is set. Three tables (`designs`, `owners`, `shares`), auto-created on startup with idempotent `CREATE TABLE IF NOT EXISTS` — no migration framework. The full `SceneDocument` is stored as `jsonb`; all queries are parameterized. Connection pooling via `pg.Pool` (`apps/api/src/db/pool.ts`), a startup ping that fails fast with a clear error if the database is unreachable, and pool `end()` on graceful shutdown (`SIGTERM`/`SIGINT`, see `apps/api/src/index.ts`).

`docker compose up` runs both a `postgres:16` service and the `api` service pointed at it by default (see `docker-compose.yml`) — set `DATABASE_URL=` (blank) in your `.env` to opt back into file-backed storage while still running the bundled Postgres container, or `pnpm --filter @interior/api dev` with `DATABASE_URL` unset for local file-backed dev (the default).

**Verification note:** the Postgres adapter's tests run the same shared `DesignStorage`/`OwnershipStore`/`ShareTokenStore` contract suites against both the file-backed stores and `PostgresDesignStorage`/etc. via [`pg-mem`](https://github.com/oguimbal/pg-mem) (an in-memory Postgres emulation) — no live Postgres was available to verify against in the environment these adapters were authored in. Code was reviewed by hand for parameterization/SQL correctness against real Postgres semantics; run `pnpm --filter @interior/api test` against a real `DATABASE_URL` before relying on this in production.

## Onboarding & Workflow

First-run users get an interactive "Build your first room" walkthrough (`apps/web/src/onboarding/`), not just static text — each step waits for (and detects) the action it's teaching:

1. **Choose a starting point**: "Start with a sample room" loads a prebuilt 4m x 3.5m living room (walls + a door + a window, no furniture) via `sceneStore.loadDocument`, or "I'll draw my own" shows the Plan-tab coach mark and waits for you to move on.
2. **Drag in furniture** (auto-switches to the 3D tab): watches `document.furniture.length` for an increase, then shows a congratulatory nudge.
3. **Try the time-of-day slider**: watches the sun's `time` field for a change, then confirms what you just saw.
4. **Save & meet the Assistant**: points at Save and the Assistant panel; finishing (or skipping, any step) persists "seen" so it won't show again.

The step machine itself (`onboarding/walkthrough.ts`) is pure/UI-free and unit-tested independent of React. Progress is gated on `localStorage` (finish or skip = seen), and the whole walkthrough is reopenable any time via the floating "?" button in the bottom-left corner.

**Move-in Shopper Workflow:**
Users can upload a floor plan (PDF or image) to trace over. **Privacy boundary**: Uploaded files remain entirely local to the import session. They are not saved in the scene document, not sent to the server, and not included in share links. 
**Manual Smoke Flow**: Upload a plan, scale it to a known dimension, trace the room outline, place a piece of furniture to check fit, and review daylight direction.

## Mobile & performance

- Lighting-quality preset (`low`/`medium`/`high`) is auto-picked on first 3D-tab visit from crude device signals (DPR, WebGL renderer string, touch/mobile UA) unless you've already chosen one manually — see `apps/web/src/perf/deviceCapability.ts` / `autoQuality.ts`. If the rolling-average frame rate stays under 40fps for 10 seconds, quality drops one tier once, with a small toast.
- The Catalog and Lighting side panels collapse into toggleable bottom sheets under 768px width (`apps/web/src/styles/responsive.css`); touch targets (buttons, tabs) grow to at least 44px on coarse-pointer (touch) devices.
- Plan editor: single-finger draw/select/drag and two-finger pinch-to-zoom + pan both work via Pointer Events (`apps/web/src/editor/PlanEditor.tsx`, gesture math in `touchGestures.ts`); `touch-action: none` on the drawing surface stops the page from scrolling while you draw. 3D tab: `OrbitControls`' touch defaults already give one-finger rotate / two-finger dolly+pan, and furniture drag-and-drop uses Pointer Events end-to-end, so it works with touch as-is.
- The existing perf HUD (`F9` to toggle), frame-time budget, and WebGL context-loss recovery overlay are unchanged — see `apps/web/src/perf/`.

## AI assistant (Phase 4, feature-flagged, on by default)

The AI assistant is **on by default** in both the web app and the API — the "Assistant" drawer shows in the 3D tab out of the box, and `POST /ai/chat` responds using the built-in offline `MockProvider` (deterministic heuristic responder, zero setup, no network calls, no API key). The core loop (draw → furnish → light → share) also still works fully without it, and the drawer's empty state is upfront about which mode you're in ("Without an AI key configured, I use built-in arrangement logic").

**Disabling it:**

```
FEATURE_AI=false pnpm --filter @interior/api dev
VITE_FEATURE_AI=false pnpm --filter @interior/web dev
```

`FEATURE_AI=false`/`0` on the API removes `POST /ai/chat` entirely (404) — `GET /ai/status` still responds (`{"enabled":false,"provider":null}`) so the web app can tell "off" apart from "on but mocked". `VITE_FEATURE_AI=false`/`0` is a **build-time** Vite env var that hides the drawer client-side; set both to fully turn the feature off end-to-end (either one alone leaves the other side still trying to reach it — the drawer degrades to a graceful in-chat error if the API side is off and the web side isn't, rather than crashing).

**Attaching a real LLM** (instead of the offline mock) — the default-on behavior never does this automatically; it always requires explicit config:

```bash
FEATURE_AI=true                                  # already the default; harmless to set explicitly
AI_PROVIDER_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-5.6-sol
AI_PROVIDER_API_KEY=sk-...
VITE_FEATURE_AI=true
```

The official GPT-5.6 integration (that exact `AI_PROVIDER_BASE_URL` + `AI_MODEL`) routes through the Responses API to reliably support typed tools; any other OpenAI-compatible `AI_PROVIDER_BASE_URL` + `AI_MODEL` (Azure, vLLM, LiteLLM, Ollama's OpenAI shim, ...) uses the Chat Completions-style path instead. `GET /ai/status` reports `{"enabled":true,"provider":"llm"}` once a real provider is configured, vs. `"provider":"mock"` for the default offline responder — that's what the chat panel's empty-state note keys off of. The route is rate-limited per IP (20 requests/minute by default, in-memory).

No `.env` file is committed with real credentials — set `AI_PROVIDER_API_KEY` etc. in your shell or a local (gitignored) `.env.development.local` / `.env.local`.
