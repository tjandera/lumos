# Marina Studio — 3D Interior Design

Arrange furniture in a 3D model of a real room and see how actual sunlight moves through
it across the day — before you buy anything.

Put your building on a satellite map, turn the room to the direction it really faces, and
the sun in the scene is the sun that will be over that address on that date. A room with
no windows and no lamps is dark, because it would be.

```bash
pnpm install && pnpm dev     # → http://localhost:5173
```

First run gives you a guided tour of the whole app. Skip to
[Quick start](#quick-start) for the details, or [Deployment](#deployment) to ship it.

---

## Contents

- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Commands](#commands)
- [Configuration](#configuration)
- [AI features](#ai-features)
- [Storage backends](#storage-backends)
- [Deployment](#deployment)
- [Performance](#performance)
- [Privacy](#privacy)
- [Testing](#testing)
- [Contributing conventions](#contributing-conventions)

---

## What it does

**Draw the room.** A 2D plan editor for walls (with real thickness), windows and doors,
extruded to 3D with genuine openings. Or upload a photo of a room and have it proposed
for you.

**Put it somewhere real.** A world map picker (satellite imagery, no API key) sets the
building's coordinates; a compass control turns the room to true north. Everything about
the light follows from that.

**Furnish it.** 35 catalog items backed by real CC0 glTF models at verified real-world
dimensions, drag/rotate gizmos, collision-aware placement, and per-item material swaps
across 10 photographed PBR texture families (oak, walnut, wool, linen, leather, marble,
plaster, carpet, metal, wood flooring).

**Light it honestly.** Sun position from `suncalc` for the room's actual latitude,
longitude, date and orientation. Interior lamps as real fixtures with physical units, a
lux heatmap against lighting standards, and a daylight model where aperture area, glass
and curtains/blinds actually govern how much light reaches the interior — including all
the way down to a dark room when there's nothing to light it.

**Study your own room.** *Image Generation Day* takes a photo of a real room and shows it
under the daylight that room actually gets, across twelve moments covering the full 24
hours — solar midnight, pre-dawn, dawn, sunrise, morning, noon, afternoon, golden hour,
sunset, dusk — with sun angles computed for your building and date. Generate a single
moment, a representative six, or the full twelve, generated in parallel (one at a time up
to all at once) so a full day takes under two minutes rather than six for the same cost —
then download the set as a ZIP with a manifest of times and sun positions. See [`apps/web/src/imageDay/`](apps/web/src/imageDay/README.md).

**Study the day.** Render one frame per hour across 24 hours and scrub through them, or
play it back. Every frame is a real render at that hour's true sun position. With an
OpenAI key, any single frame can additionally be re-lit photorealistically into one of
five moods — clearly labelled, and never confused with the physically-accurate cycle it
sits above.

**Keep it.** Optional accounts (email + password, scrypt-hashed) so designs follow you to
another browser. Entirely additive: there is no login wall, anonymous use works exactly as
before, and designs made before signing up move to the account rather than being stranded.
Needs Postgres; without it, accounts report themselves unavailable and nothing else
changes.

**Share it.** Read-only links via unguessable tokens, with the location deliberately
coarsened on the way out (see [Privacy](#privacy)).

## Quick start

**Requirements:** Node.js ≥ 22, pnpm ≥ 11 (`corepack enable`).

```bash
pnpm install
pnpm dev
```

- Web app → http://localhost:5173
- API → http://127.0.0.1:8787

`turbo` builds the workspace packages first, so a clean checkout works without a separate
build step.

Everything above works with no API keys, no database and no accounts. The optional extras
are: an OpenAI key (photoreal re-lighting, photo room import), an LLM provider (the chat
assistant), and Postgres (multi-instance persistence). See [Configuration](#configuration).

### Or with Docker

```bash
docker compose up --build
```

- Web → http://localhost:8080
- API → http://localhost:3001
- Postgres, wired up automatically

## Architecture

**The scene document is the contract.** `packages/core` owns a plain, serializable
`SceneDocument` — a zod schema, versioned with migrations, in meters, Y-up. The renderer
draws it; the AI layer proposes edits to it; the API stores it. Nothing else is shared
state, which is why the AI, the renderer and storage can each change without the others
noticing.

```
                    ┌──────────────────────────┐
                    │  packages/core           │
                    │  SceneDocument (zod)     │   pure TS
                    │  migrations · undo       │   no three.js, no React, no DOM
                    │  sun · daylight · lux    │
                    └────────────┬─────────────┘
                                 │ reads / mutates
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
┌─────────▼─────────┐  ┌─────────▼─────────┐  ┌─────────▼─────────┐
│ packages/renderer │  │ packages/ai       │  │ apps/api          │
│ R3F scene, PBR    │  │ typed tools from  │  │ Fastify: catalog, │
│ materials, sun    │  │ the same schema   │  │ designs, shares,  │
│ rig, trim         │  │ + a solver        │  │ AI + image proxy  │
└─────────┬─────────┘  └─────────┬─────────┘  └─────────┬─────────┘
          └──────────────────────┼──────────────────────┘
                       ┌─────────▼─────────┐
                       │ apps/web          │  Vite · React 19 · R3F v9
                       │ panels, tour, HUD │  Tailwind · Zustand + Immer
                       └───────────────────┘
```

Three invariants make the rest of the design work:

1. **Every schema change bumps `CURRENT_SCHEMA_VERSION` and ships a migrator.** Saved and
   shared designs are migrated on load and never break.
2. **The AI never emits coordinates.** It proposes constraints and intent; a deterministic
   solver places and validates, rejecting and repairing anything that collides or violates
   clearance. LLM spatial reasoning is unreliable, so it's structurally kept out of the
   loop that matters.
3. **Undo is patch-based** (Immer patches, not snapshots), and one logical edit — including
   a multi-step AI edit — is one undo step.

## Repository layout

| Path | What lives there |
| --- | --- |
| [`packages/core`](packages/core) | `SceneDocument` schema, migrations, undo, sun/daylight/lux math, privacy coarsening. Pure TS. |
| [`packages/renderer`](packages/renderer) | React Three Fiber scene: walls, trim, materials, lighting rig, box-UV projection. |
| [`packages/catalog`](packages/catalog) | The furniture catalog: 35 items with real dimensions and model paths. |
| [`packages/ai`](packages/ai) | LLM provider abstraction, tool schemas derived from core's zod, the layout solver. |
| [`apps/web`](apps/web) | The client: panels, plan editor, light study, guided tour, perf HUD. |
| [`apps/api`](apps/api) | Fastify: catalog, designs CRUD, share links, photo import, light-study relighting. |
| [`deploy/`](deploy) | Kubernetes manifests (kustomize base + overlays) and deployment guide. |
| [`catalog/`](catalog) | Asset manifest and licensing provenance for every model and texture. |
| [`scripts/`](scripts) | `fetch_models.py` — the reproducible CC0 model pipeline (Draco + 512px textures). |

Each package has its own README with the detail.

## Commands

```bash
pnpm dev         # web (5173) + api (8787)
pnpm build       # build every package and app
pnpm test        # unit tests (Vitest)
pnpm typecheck   # typecheck every workspace
pnpm lint        # lint every workspace
```

Scope any of them to one workspace with `--filter`:

```bash
pnpm --filter @interior/core test
pnpm --filter @interior/web dev
```

## Configuration

Nothing here is required to run the app. Each variable switches on an optional feature.

### API (`apps/api/.env`, or the environment)

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `8787` (`3001` in Docker) | HTTP listen port. |
| `VITE_ORIGIN` | `http://localhost:5173` | CORS allow-origin. Set to your public URL in production. |
| `SESSION_SECRET` | *(insecure dev default)* | Signs the ownership cookie. **Set this in any deployment** — the fallback is hard-coded and would let anyone forge ownership of any design. |
| `TRUST_PROXY` | unset | Hop count to trust `X-Forwarded-For` from. **Set to `1` behind one proxy** — without it every per-IP rate limit becomes one global bucket. |
| `IMAGE_DAILY_MAX` | `100` | Hard ceiling on billed image calls per day. Shared across replicas when `DATABASE_URL` is set. The image endpoints are unauthenticated by design. |
| `SESSION_COOKIE_SAMESITE` | `lax` | Set to `none` only when the web app and API are on different domains — `lax` cookies aren't sent cross-site, which silently breaks design ownership. |
| `DATABASE_URL` | unset → file-backed | Postgres connection string. See [Storage backends](#storage-backends). |
| `OPENAI_API_KEY` | unset | Photo room import and photoreal light-study re-lighting. |
| `OPENAI_MODEL` | `gpt-5.6` | Vision model for photo import. |
| `OPENAI_IMAGE_MODEL` | `gpt-image-1` | Image model for re-lighting and Image Generation Day. Set `gpt-image-2` if your account has it — faster and more faithful to the source photo. |
| `LIGHT_STUDY_MOCK` | `false` | Canned re-lighting responses — exercise the whole flow with no key and no billing. |
| `IMAGE_DAY_MOCK` | `false` | Same, for Image Generation Day. |
| `ROOM_PHOTO_MOCK` | `false` | Same, for photo import. |
| `FEATURE_AI` | `true` | Registers the chat assistant routes. |
| `AI_PROVIDER_BASE_URL` / `AI_MODEL` / `AI_PROVIDER_API_KEY` | unset | An OpenAI-compatible endpoint for the chat assistant. Unset → built-in offline mock. |

### Web (build time)

Vite substitutes these into the bundle at build time, so they are **`--build-arg`s, not
runtime container env vars**. A built bundle cannot read the environment it runs in.

| Variable | Default | What it does |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:3001` | Base URL the browser calls. Use `/api` behind a single-origin ingress. |
| `VITE_FEATURE_AI` | `true` | Shows the AI assistant panel. |
| `VITE_FEATURE_ROOM_PHOTO` | `false` | Shows photo room import. |

## AI features

Three separate things, deliberately independent — any one can be off without affecting the
others.

**Layout assistant.** Ask for a layout; the model proposes intent and a deterministic
solver places the furniture, validating clearances and rejecting collisions. Works with no
key at all via a built-in offline responder, so the button is never a dead end.

**Photo room import** (`FEATURE_ROOM_PHOTO`). Upload a photo of a room; a vision model
proposes a `RoomPhotoProposal`, which deterministic code validates and materializes into a
real `SceneDocument`. The proposal is schema-checked before anything touches the document.

**Image Generation Day.** A photo of a real room, re-lit across that day's real sun. A
vision pass reads the room once so every generated hour keeps the same furniture and
windows; `images.edit` then transforms the photo rather than inventing a room. Six moments,
individually or as a timelapse, cached in IndexedDB because each one is a billed call.

**Photoreal light study.** The 24-hour day cycle is rendered locally and is the
physically-accurate one. On top of it, a single frame can be re-lit into one of five moods
by an image model. It's labelled as AI re-lit in the UI, capped at 12 requests per 5
minutes, and the panel says plainly that the model can drift from your actual furniture.

Set `LIGHT_STUDY_MOCK=true` to click through the entire flow without a key or a bill.

## Storage backends

Designs, ownership and share tokens sit behind three interfaces with two implementations
each:

- **File-backed (default).** One JSON file per design with atomic temp-file+rename writes.
  Zero setup. Per-instance, so it does not survive rescheduling and is wrong for more than
  one replica.
- **Postgres.** Selected automatically when `DATABASE_URL` is set. Three tables created
  idempotently at startup, the document stored as `jsonb`, all queries parameterized,
  pooled connections, a fail-fast startup ping, and pool teardown on `SIGTERM`.

Both implementations run against the same shared contract test suite.

## Deployment

Two supported paths, both real:

**Docker Compose** — one command, includes Postgres:

```bash
docker compose up --build
```

**Kubernetes** — kustomize base plus `local` and `production` overlays, with liveness /
readiness / startup probes, resource limits, HPAs, PodDisruptionBudgets, non-root
read-only-root-filesystem containers, and single-origin ingress routing:

```bash
kubectl apply -k deploy/k8s/overlays/local
```

Full walkthrough, including image building, secret creation and the build-time API URL
gotcha: **[`deploy/README.md`](deploy/README.md)**.

**Before pointing a public URL at this, read [`deploy/SECURITY.md`](deploy/SECURITY.md)** —
the audit findings, the five variables you must set, and a free hosting stack
(Cloudflare Pages + Google Cloud Run + Neon) chosen for the fact that image generation
takes 35–90 s, which most free serverless tiers will time out.

## Performance

The renderer targets 30–60 fps and adapts to the machine it's on rather than assuming a
workstation:

- **Device tiering** at startup from the GPU string, core count, memory and pixel ratio
  picks an initial quality tier, a pixel-ratio cap (1–2×), and a power preference.
- **On-demand rendering.** The frame loop is idle unless something changed, so a static
  scene costs nothing — this is the difference between a quiet laptop and a loud one.
- **A bidirectional quality governor** moves quality up and down at runtime to hold the
  frame-rate band, rather than only degrading.
- `prefers-reduced-motion` is respected.

Press the perf HUD (top right) for live frame time, draw calls and triangle counts.

## Privacy

A home address is PII and is treated as such. It never enters the scene document. Only
coarse coordinates travel with a design: on share and export, latitude and longitude are
rounded to 2 decimal places (~1 km) along with a north offset — enough for the sun to be
right, not enough to identify a building. Uploaded floor plans and room photos stay in the
import session; they are not persisted into the document and not included in share links.

## Testing

Deterministic unit tests are the primary safety net — schema round-trips, every migration
path, undo, sun vectors against reference values, collision, wall extrusion, daylight
aperture, and the storage contracts against both backends.

```bash
pnpm test
pnpm --filter @interior/core test
```

Known gap: `apps/web` carries a set of failing tests from an in-progress module port
(`guidance/`, `store/`, `ai/chatStore`). They are tracked and unrelated to the shipped
feature set.

## Contributing conventions

See [`CLAUDE.md`](CLAUDE.md) for the full set. The load-bearing ones:

- Keep `packages/core` free of three.js, React and DOM.
- Meters, Y-up, right-handed; angles in degrees in the document.
- Every schema change bumps `CURRENT_SCHEMA_VERSION` **and** adds a migrator.
- Features ship behind flags.
- Never trust raw LLM coordinates.
- Home address is PII.

## License

See [`LICENSE`](LICENSE). Third-party model and texture provenance — all CC0 — is recorded
in [`LICENSES.md`](LICENSES.md) and [`catalog/README.md`](catalog/README.md).
