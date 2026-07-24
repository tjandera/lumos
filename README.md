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
