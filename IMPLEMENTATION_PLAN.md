# Implementation Plan — 3D Property Interior Design Web App

Arrange furniture in a 3D model of your new home before you buy it, with realistic light and shadow so you can judge how a room actually feels.

## 1. Product scope (MVP)

- Draw a 2D floor plan (walls, windows, doors) → auto-extrude to 3D room.
- Furniture catalog: browse, drag into room, move/rotate/scale with collision + snap.
- Real-time light & shadow: time-of-day sun, window light, interior lamps.
- AI assistant (LLM API): layout suggestions, natural-language scene control ("move the sofa under the window"), product/shopping advice.
- Save/load designs; share a view link.

Note: "GPT-5.6" is written into the stack as a placeholder — the AI layer is model-agnostic behind one interface, so swap in whatever chat/completions model you actually have access to.

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | Requested; safety across a large scene-graph codebase |
| 3D engine | Three.js + react-three-fiber + drei | Requested; R3F gives declarative scene management in React |
| UI | React + Vite + Tailwind | Fast dev loop |
| State | Zustand | Scene + UI state, undo/redo via snapshots |
| Sun position | suncalc | Real sun azimuth/elevation from address + date/time |
| Assets | glTF/GLB + Draco/Meshopt compression | Standard, streamable furniture models |
| AI | LLM API (placeholder "GPT-5.6") with function/tool calling | Structured scene edits, layout JSON |
| Backend | Node (Fastify) + Postgres + S3-compatible storage | Designs, catalog, auth, model files |
| Testing | Vitest + Playwright; screenshot diffing for renders | Catch visual regressions in lighting |

## 3. Light & shadow: technology options considered

Decision: **real-time approximate** (option A), with the architecture left open for B/C later.

**A. Real-time shadow mapping (chosen for MVP)**
- Directional light (sun) with PCFSoftShadowMap or VSM; per-lamp point/spot shadows.
- Cascaded shadow maps not needed at room scale — one tight shadow frustum per room.
- Image-based lighting: HDRI environment + `PMREMGenerator` for realistic ambient.
- Ambient occlusion: SSAO/GTAO postprocessing pass for contact grounding.
- `suncalc` drives sun direction from geolocation + date + time slider → "what does this room look like at 5pm in December?" is the killer feature.
- Physically correct light units (`renderer.useLegacyLights = false`, candela/lux) so lamp brightness is meaningful.

**B. Baked lightmaps (later, optional)**
- Offline bake (e.g., via a headless pass or three-gpu-pathtracer accumulation) → static, high-quality soft GI for walls/floor. Good for a "polished view" mode; invalidated on every furniture move, so not for the editor loop.

**C. Path tracing (later, optional)**
- three-gpu-pathtracer for a "photoreal snapshot" button: progressive render of the current view for sharing/decision-making. Ground truth for QA-ing option A.

**D. Rejected for MVP**: WebGPU-only pipelines (still-uneven support), server-side rendering farms (cost/latency), light probes/LPV (complexity vs. payoff at single-room scale).

## 4. Architecture

```
apps/web            React + R3F frontend
packages/core       Scene document model (rooms, openings, furniture, lights) — pure TS, no three.js
packages/renderer   three.js/R3F rendering of the core document, lighting rig
packages/ai         LLM client, tool schemas (moveItem, suggestLayout, …)
apps/api            Fastify: auth, designs CRUD, catalog, share links
```

Core principle: the **scene document** is plain serializable data. Renderer and AI both operate on it. The LLM never touches three.js — it calls typed tools (`placeFurniture`, `moveItem`, `setTimeOfDay`, `querySpace`) that mutate the document; the renderer reacts. This makes AI edits undoable, testable, and safe.

## 5. Phases

**Phase 0 — Foundation (week 1)**
Monorepo (pnpm + turborepo), CI, lint/typecheck, core document model + unit tests, empty R3F canvas.

**Phase 1 — Floor plan → 3D (weeks 2–3)**
2D plan editor (walls with thickness, windows, doors, room dimensions from user input); extrusion to 3D meshes with correct openings (CSG or shape-with-holes); orbit/walk cameras.

**Phase 2 — Furniture (weeks 3–5)**
Catalog service + GLB pipeline (Draco compression, thumbnails); drag-drop placement, gizmos (translate/rotate), floor/wall snapping, AABB collision, measurement overlay; undo/redo; save/load designs.

**Phase 3 — Lighting (weeks 5–7)**
Sun rig from suncalc (address geocode + compass orientation of the plan + date/time slider); window light via shadow-casting sun + HDRI ambient; interior lamps as products that emit light; SSAO pass; quality presets (mobile → high); screenshot-diff tests against reference renders.

**Phase 4 — AI assistant (weeks 7–9)**
Tool-calling layer over the scene document; layout suggestion flow (room + furniture list → candidate layouts, validated by collision/clearance rules — never trust raw LLM coordinates, always validate + repair); NL commands; shopping advice grounded in the catalog (fits-through-door checks, dimension filters).

**Phase 5 — Polish & ship (weeks 9–10)**
Share links (read-only viewer), onboarding, perf pass (frustum culling, instancing, texture budgets), mobile support, error tracking, deploy.

**Later**: baked/pathtraced "photo mode", scan/floor-plan-image import, multi-room homes, AR view.

## 6. Delegation model (per CLAUDE.md)

Fable 5 orchestrates only — no Fable 5 subagents.

- **Sonnet 5**: bulk implementation — UI components, plan editor, catalog CRUD, tests, asset pipeline scripts.
- **Opus 4.8**: hard problems — extrusion/CSG geometry, lighting rig + physically correct units, AI tool-schema design, undo/redo architecture.
- **Fable 5 (me)**: phase plans, task decomposition, code review + QA gate at the end of each phase (typecheck, tests, screenshot diffs, manual scene checks).

## 7. Risks

- **Lighting believability vs. performance**: shadow-map acne/peter-panning on thin walls — mitigate with normal-offset bias tuning and QA against pathtraced references.
- **LLM spatial reasoning is weak**: mitigate by making the AI propose *constraints/intents* and having deterministic layout code do placement.
- **Furniture asset quality/licensing**: decide early whether catalog is retailer-fed (need partnerships/scraping policy) or curated generic models.
- **Model naming**: keep the AI layer behind one interface so the model choice is a config value.

## 8. Definition of done (MVP)

A user can draw their apartment, orient it to real-world north, place catalog furniture, scrub time-of-day and watch sunlight move across the floor, ask the AI to "suggest a cozy living-room layout under $3k," and share a link — at 60fps on a mid-range laptop.
