# CLAUDE.md — 3D Property Interior Design

Guidance for AI agents (and humans) working in this repo. See `IMPLEMENTATION_PLAN.md`
for the full plan and phases.

## What this is

A web app to arrange furniture in a 3D model of a home with realistic sun/shadow before
buying.

## Golden rules (invariants)

- **The scene document is the contract.** `packages/core` owns a plain, serializable
  `SceneDocument` (zod schema). The renderer and the AI only read/mutate this document.
  Keep `packages/core` free of three.js / React / DOM.
- **Units & coordinates are fixed.** Meters; three.js right-handed, Y-up; floor plan on
  the X/Z plane; angles in degrees in the document. See `packages/core/src/units.ts`.
  Changing these is a migration-worthy break.
- **Every schema change bumps `CURRENT_SCHEMA_VERSION` and adds a migrator** in
  `packages/core/src/migrations.ts`. Saved/shared designs are migrated on load — never
  break them.
- **Undo is patch-based** (`History`, `packages/core/src/undo.ts`). Group a logical edit
  (including AI multi-step edits) into one `update` so it's one undo step.
- **Features ship behind flags.** AI lives behind `FEATURE_AI` (`isFeatureEnabled('ai')`),
  default off.
- **Never trust raw LLM coordinates.** The AI proposes constraints/intents; deterministic
  code places + validates (Phase 4).
- **Home address is PII.** Keep it out of the shareable document; only coarse lat/lng +
  north offset travel with a design.

## Layout

- `packages/core` — scene document, schema, migrations, undo, flags (pure TS)
- `packages/renderer` — react-three-fiber rendering of a SceneDocument
- `apps/web` — Vite + React + Tailwind app shell + perf HUD
- `catalog/` — furniture catalog manifest + licensing (asset files pending)
- `apps/api` — (later) Fastify: auth, designs, catalog, share links

## Commands

- `pnpm install` — install
- `pnpm dev` — run the web app (Vite, http://localhost:5173)
- `pnpm test` — unit tests (Vitest)
- `pnpm typecheck` — typecheck all packages

## Delegation model

Fable 5 orchestrates (no Fable 5 subagents). Sonnet 5: bulk implementation. Opus 4.8:
hard problems (extrusion/CSG, lighting rig + physical units, AI tool-schema design, undo
architecture). QA gate each phase: typecheck, tests, screenshot diffs, manual scene check.

## Testing

Deterministic unit tests are the primary safety net (schema, migrations, undo — and later
sun-vector, collision, extrusion). Screenshot-diff render tests run in a pinned env only.
