<div align="center">

# Project Lumos

### See the light before you buy the sofa.

Arrange furniture in a 3D model of a real room and watch **actual sunlight** move through it
across the day — computed from your building's coordinates, orientation and date.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-5FA04E?logo=node.js&logoColor=white)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm&logoColor=white)](https://pnpm.io)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![three.js](https://img.shields.io/badge/three.js-r171-000000?logo=three.js&logoColor=white)](https://threejs.org)
[![Docker](https://img.shields.io/badge/docker-compose-2496ED?logo=docker&logoColor=white)](#docker-compose)
[![Kubernetes](https://img.shields.io/badge/kubernetes-kustomize-326CE5?logo=kubernetes&logoColor=white)](deploy/README.md)

[**Quick start**](#quick-start) ·
[**What you can do**](#features) ·
[**Deploy**](#deploy) ·
[**Configuration**](#configuration) ·
[**Architecture**](#architecture)

<img src="docs/media/hero.png" alt="Marina Studio: a furnished 3D room lit by real afternoon sun" width="100%">

</div>

---

## The idea

Put your building on a satellite map, turn the room to the direction it really faces, and the
sun in the scene becomes the sun that will actually be over that address on that date. Move
the time slider and the light moves with it — through the real windows, at the real angles.

A room with no windows and no lamps renders **dark**, because it would be.

<div align="center">
<img src="docs/media/day-cycle.gif" alt="The same room from dawn to dusk: lamps fade out, daylight sweeps across the floor" width="640">
<br>
<em>One room, 05:30 → 20:30. Nothing here is a preset — every frame is the true sun position for this building.</em>
</div>

---

<a id="quick-start"></a>

## 🚀 Quick start (2 minutes)

**You need:** [Node.js](https://nodejs.org) 22 or newer. That's it — no API keys, no database,
no account.

```bash
corepack enable                 # turns on pnpm, ships with Node
git clone https://github.com/tjandera/lumos.git
cd lumos
pnpm install
pnpm dev
```

Open **http://localhost:5173** and the guided walkthrough builds your first room with you.

| | |
| --- | --- |
| Web app | http://localhost:5173 |
| API | http://127.0.0.1:8787 |

> `pnpm dev` starts the web app and the API together, and builds the shared packages first,
> so a fresh clone works with no separate build step.

### Prefer Docker?

One command, Postgres included:

```bash
docker compose up --build
```

Web on **http://localhost:8080**, API on **http://localhost:3001**.

### Turning on the optional AI features

Everything above works without them. To try the AI flows **for free, with no key and no
billing**, copy the example env file and switch the mocks on:

```bash
cp apps/api/.env.example apps/api/.env
```

```bash
# apps/api/.env
LIGHT_STUDY_MOCK=true    # photoreal re-lighting
IMAGE_DAY_MOCK=true      # Image Generation Day
ROOM_PHOTO_MOCK=true     # import a room from a photo
```

Restart `pnpm dev` and the whole flow is clickable end to end. Swap in a real
`OPENAI_API_KEY` when you want genuine results — see [Configuration](#configuration).

---

<a id="features"></a>

## ✨ What you can do

### Start with a guided walkthrough

First load drops you into a real sample room with a nine-step walkthrough and a keyboard
cheat sheet. Skip it any time; replay it from the **Tour** button.

<img src="docs/media/onboarding.png" alt="First-run walkthrough over a furnished sample room" width="100%">

### Draw the room

A 2D plan editor with real wall thickness, windows and doors — extruded to 3D with genuine
openings. Drag endpoints to reshape, drag furniture to move, snap to 0.1 m, rotate the whole
building. Every edit is one undo step.

<img src="docs/media/plan-editor.png" alt="2D plan editor showing walls, dimensions, furniture footprints and light fixtures" width="100%">

### Put it somewhere real

Find your building on satellite imagery (no API key needed), drop the pin, then turn the room
until it faces the way it really does. Sunrise and sunset bearings are drawn right on the map.

Note the footer: your precise position stays local, and only a **coarsened** coordinate travels
with a shared design. See [Privacy](#privacy).

<img src="docs/media/location.png" alt="Satellite map picker with sunrise/sunset bearings and a building-orientation control" width="100%">

### Light it honestly

Sun position from `suncalc` for your latitude, longitude, date and orientation. Add interior
fixtures with physical units — Kelvin, brightness, shadows, dusk auto-on — and check the room
against real lighting standards with the **lux heatmap**.

<img src="docs/media/lighting.png" alt="Lighting panel with an illuminance heatmap and per-fixture Kelvin and brightness controls" width="100%">

### Study the whole day

Render one frame per hour across 24 hours, then scrub or play it back. Every frame is a real
render at that hour's true sun position — including the hours after sunset, where your lamps
take over.

<img src="docs/media/light-study.png" alt="Light study: 24 rendered frames with a scrub bar and an optional photoreal re-light pass" width="100%">

### Study your *own* room from a photo

**Image Generation Day** takes a photo of a real room and shows it under the daylight that room
actually gets, across twelve moments covering the full 24 hours — solar midnight through dawn,
noon, golden hour, sunset and dusk — with sun angles computed for your building and date.

Generate one moment, a representative six, or the full twelve in parallel, then download the
set as a ZIP with a manifest of times and sun positions.

<img src="docs/media/image-day.png" alt="Image Generation Day moment picker showing twelve times of day with real sun positions" width="100%">

### Furnish it

35 catalog items backed by real CC0 glTF models at verified real-world dimensions, with
drag/rotate gizmos, collision-aware placement, and per-item material swaps across 10
photographed PBR texture families — oak, walnut, wool, linen, leather, marble, plaster, carpet,
metal and wood flooring. Wall, floor and ceiling finishes are independently adjustable.

<img src="docs/media/materials.png" alt="Materials panel with matte, eggshell, satin and gloss finishes for walls, floor and ceiling" width="100%">

### Share it

Read-only links via unguessable tokens, with the location deliberately coarsened on the way out.

---

<a id="deploy"></a>

## 🌍 Deploy it

Three supported paths. All of them build from the same two images.

<a id="docker-compose"></a>

### Option 1 — Docker Compose (easiest)

```bash
docker compose up --build
```

Web on `:8080`, API on `:3001`, Postgres wired up automatically. Good for a single host or a
VPS. Override anything with a gitignored `.env` beside `docker-compose.yml`.

### Option 2 — Free cloud hosting

A stack chosen for one specific constraint: image generation takes 35–90 s per call, which
most free serverless tiers will time out on.

| Tier | Platform | Why |
| --- | --- | --- |
| Web (static) | **Cloudflare Pages** | Free, unlimited bandwidth, automatic TLS, HTTP/2 — which is what makes the parallel image generation actually parallel. |
| API (container) | **Google Cloud Run** | Real always-free allowance, scales to zero, runs `apps/api/Dockerfile` unchanged, timeout configurable well past 90 s. |
| Database | **Neon** free tier | Serverless Postgres, scales to zero, plain connection string into `DATABASE_URL`. |

Full reasoning, alternatives, and the no-credit-card variant: [`deploy/SECURITY.md`](deploy/SECURITY.md).

### Option 3 — Kubernetes

Kustomize base plus `local` and `production` overlays, with liveness / readiness / startup
probes, resource limits, HPAs, PodDisruptionBudgets, non-root read-only-root-filesystem
containers, and single-origin ingress routing:

```bash
kubectl apply -k deploy/k8s/overlays/local
```

Full walkthrough including image building and secret creation: [`deploy/README.md`](deploy/README.md).

### ⚠️ Before you point a public URL at this

Five things, and none of them are optional. The full audit is in
[`deploy/SECURITY.md`](deploy/SECURITY.md).

| Set this | To | Or else |
| --- | --- | --- |
| `SESSION_SECRET` | `openssl rand -base64 48` | It falls back to a hard-coded, publicly-known default and anyone can forge ownership of any design. |
| `NODE_ENV` | `production` | No `secure` cookies, no HSTS, and localhost stays in the CORS allowlist. |
| `TRUST_PROXY` | your real hop count (`1` behind one proxy) | Every per-IP rate limit collapses into one global bucket. |
| `VITE_ORIGIN` | your public web URL | CORS rejects your own front end. |
| `IMAGE_DAILY_MAX` | a number you're happy to pay for | **The image endpoints are unauthenticated by design.** A public URL is a free image generator funded by your key. |

Also set a hard monthly spend limit in the OpenAI dashboard. It is the only layer that
survives a bug in the other ones.

**The most common broken deployment** is `VITE_API_URL`. Vite bakes it into the bundle at
*build* time, so setting it as a runtime container variable does nothing. Build with
`--build-arg VITE_API_URL=/api` and let your ingress route `/api/*`. Details in
[`deploy/README.md`](deploy/README.md#the-build-time-api-url).

---

<a id="configuration"></a>

## ⚙️ Configuration

Nothing here is required to run the app. Each variable switches on an optional feature.

### API (`apps/api/.env`, or the environment)

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `8787` (`3001` in Docker) | HTTP listen port. |
| `VITE_ORIGIN` | `http://localhost:5173` | CORS allow-origin. Set to your public URL in production. |
| `SESSION_SECRET` | *(insecure dev default)* | Signs the ownership cookie. **Set this in any deployment.** |
| `TRUST_PROXY` | unset | Hop count to trust `X-Forwarded-For` from. **Set to `1` behind one proxy.** |
| `IMAGE_DAILY_MAX` | `100` | Hard ceiling on billed image calls per day. Shared across replicas when `DATABASE_URL` is set. |
| `SESSION_COOKIE_SAMESITE` | `lax` | Set to `none` only when web and API are on different domains — `lax` cookies aren't sent cross-site, which silently breaks design ownership. |
| `DATABASE_URL` | unset → file-backed | Postgres connection string. See [Storage backends](#storage-backends). |
| `OPENAI_API_KEY` | unset | Photo room import, photoreal re-lighting, Image Generation Day. |
| `OPENAI_MODEL` | `gpt-5.6` | Vision model for photo import. |
| `OPENAI_IMAGE_MODEL` | `gpt-image-1` | Image model for re-lighting and Image Generation Day. Set `gpt-image-2` if your account has it — faster and more faithful to the source photo. |
| `LIGHT_STUDY_MOCK` | `false` | Canned re-lighting responses — exercise the whole flow with no key and no billing. |
| `IMAGE_DAY_MOCK` | `false` | Same, for Image Generation Day. |
| `ROOM_PHOTO_MOCK` | `false` | Same, for photo import. |
| `FEATURE_AI` | `true` | Registers the chat assistant routes. |
| `AI_PROVIDER_BASE_URL` / `AI_MODEL` / `AI_PROVIDER_API_KEY` | unset | An OpenAI-compatible endpoint for the chat assistant. Unset → built-in offline mock. |

### Web (build time)

Vite substitutes these into the bundle at build time, so they are **`--build-arg`s, not runtime
container env vars**. A built bundle cannot read the environment it runs in.

| Variable | Default | What it does |
| --- | --- | --- |
| `VITE_API_URL` | `/api` under `pnpm dev`, `http://localhost:3001` in a build | Base URL the browser calls. Use `/api` behind a single-origin ingress. |
| `VITE_FEATURE_AI` | `true` | Shows the AI assistant panel. |
| `VITE_FEATURE_ROOM_PHOTO` | `false` | Shows photo room import. |

---

<a id="architecture"></a>

## 🏗 Architecture

**The scene document is the contract.** `packages/core` owns a plain, serializable
`SceneDocument` — a zod schema, versioned with migrations, in meters, Y-up. The renderer draws
it; the AI layer proposes edits to it; the API stores it. Nothing else is shared state, which
is why the AI, the renderer and storage can each change without the others noticing.

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
   clearance. LLM spatial reasoning is unreliable, so it's structurally kept out of the loop
   that matters.
3. **Undo is patch-based** (Immer patches, not snapshots), and one logical edit — including a
   multi-step AI edit — is one undo step.

### Repository layout

| Path | What lives there |
| --- | --- |
| [`packages/core`](packages/core) | `SceneDocument` schema, migrations, undo, sun/daylight/lux math, privacy coarsening. Pure TS. |
| [`packages/renderer`](packages/renderer) | React Three Fiber scene: walls, trim, materials, lighting rig, box-UV projection. |
| [`packages/catalog`](packages/catalog) | The furniture catalog: 35 items with real dimensions and model paths. |
| [`packages/ai`](packages/ai) | LLM provider abstraction, tool schemas derived from core's zod, the layout solver. |
| [`apps/web`](apps/web) | The client: panels, plan editor, light study, guided tour, perf HUD. |
| [`apps/api`](apps/api) | Fastify: catalog, designs CRUD, share links, accounts, photo import, re-lighting. |
| [`deploy/`](deploy) | Kubernetes manifests (kustomize base + overlays), deployment guide, security audit. |
| [`catalog/`](catalog) | Asset manifest and licensing provenance for every model and texture. |
| [`scripts/`](scripts) | `fetch_models.py` — the reproducible CC0 model pipeline (Draco + 512px textures). |

Each package has its own README with the detail.

### Commands

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

---

## 🤖 AI features

Four separate things, deliberately independent — any one can be off without affecting the
others, and each has a mock that runs for free.

**Layout assistant.** Ask for a layout; the model proposes intent and a deterministic solver
places the furniture, validating clearances and rejecting collisions. Works with no key at all
via a built-in offline responder, so the button is never a dead end.

**Photo room import** (`VITE_FEATURE_ROOM_PHOTO`). Upload a photo of a room; a vision model
proposes a `RoomPhotoProposal`, which deterministic code validates and materializes into a real
`SceneDocument`. The proposal is schema-checked before anything touches the document.

**Image Generation Day.** A photo of a real room, re-lit across that day's real sun. A vision
pass reads the room once so every generated hour keeps the same furniture and windows;
`images.edit` then transforms the photo rather than inventing a room. Cached in IndexedDB
because each one is a billed call.

**Photoreal light study.** The 24-hour day cycle is rendered locally and is the
physically-accurate one. On top of it, a single frame can be re-lit into one of five moods by
an image model. It's labelled as AI re-lit in the UI, capped at 12 requests per 5 minutes, and
the panel says plainly that the model can drift from your actual furniture.

<a id="storage-backends"></a>

## Storage backends

Designs, ownership and share tokens sit behind three interfaces with two implementations each:

- **File-backed (default).** One JSON file per design with atomic temp-file+rename writes. Zero
  setup. Per-instance, so it does not survive rescheduling and is wrong for more than one
  replica.
- **Postgres.** Selected automatically when `DATABASE_URL` is set. Tables created idempotently
  at startup, the document stored as `jsonb`, all queries parameterized, pooled connections, a
  fail-fast startup ping, and pool teardown on `SIGTERM`.

Both implementations run against the same shared contract test suite.

**Accounts are a Postgres-only feature.** With a database configured, visitors can register and
sign in to reach their designs from any browser. Without one, ownership is an anonymous signed
cookie: whoever holds it owns the design, and clearing cookies loses access. There is no
password reset, because no email provider is wired up.

## ⚡ Performance

The renderer targets 30–60 fps and adapts to the machine it's on rather than assuming a
workstation:

- **Device tiering** at startup from the GPU string, core count, memory and pixel ratio picks an
  initial quality tier, a pixel-ratio cap (1–2×), and a power preference.
- **On-demand rendering.** The frame loop is idle unless something changed, so a static scene
  costs nothing — this is the difference between a quiet laptop and a loud one.
- **A bidirectional quality governor** moves quality up and down at runtime to hold the
  frame-rate band, rather than only degrading.
- `prefers-reduced-motion` is respected.

Press the perf HUD (top right) for live frame time, draw calls and triangle counts.

<a id="privacy"></a>

## 🔒 Privacy

A home address is PII and is treated as such. It never enters the scene document. Only coarse
coordinates travel with a design: on share and export, latitude and longitude are rounded to 2
decimal places (~1 km) along with a north offset — enough for the sun to be right, not enough to
identify a building. The coarsening happens **on the server**, where it cannot be bypassed.

Uploaded floor plans and room photos stay in the import session; they are not persisted into the
document and not included in share links.

## 🧪 Testing

Deterministic unit tests are the primary safety net — schema round-trips, every migration path,
undo, sun vectors against reference values, collision, wall extrusion, daylight aperture, and
the storage contracts against both backends.

```bash
pnpm test
pnpm --filter @interior/core test
```

| Workspace | Status |
| --- | --- |
| `packages/core` | 133 passing |
| `packages/renderer` | 55 passing |
| `packages/ai` | 50 passing |
| `apps/api` | 230 passing |
| `apps/web` | 320 passing, **25 failing across 8 suites** |

**Known gap, tracked and unrelated to the shipped feature set:** `apps/web` carries failing
tests from an in-progress module port — `guidance/rules`, `guidance/starterLayout`,
`scene3d/furniturePlacement`, `store/*`, `ai/chatStore` and `components/DaylightSummary`. This
means **`pnpm test` currently exits non-zero**, and CI on `main` is red until that port lands.
Everything else passes.

## 🤝 Contributing conventions

See [`CLAUDE.md`](CLAUDE.md) for the full set. The load-bearing ones:

- Keep `packages/core` free of three.js, React and DOM.
- Meters, Y-up, right-handed; angles in degrees in the document.
- Every schema change bumps `CURRENT_SCHEMA_VERSION` **and** adds a migrator.
- Features ship behind flags.
- Never trust raw LLM coordinates.
- Home address is PII.

## 📄 License

[MIT](LICENSE). Third-party model and texture provenance — all CC0 — is recorded in
[`LICENSES.md`](LICENSES.md) and [`catalog/README.md`](catalog/README.md).
