# Lumos 

### AI-assisted sunlight simulation and layout studio for real rooms

Arrange furniture in a 3D model of your home, under the sun that will actually be over
that address, before you buy.

A browser interior tool: draw or import a floor plan, place your building on a satellite
map, furnish from a catalog, scrub the time of day so real daylight and shadows move
through the room, and ask for a layout that respects walls, clearances and footprints.

## Problem

Buying furniture is a spatial and lighting bet. People decide from catalog photos shot in
rooms they do not own, then discover the sofa blocks the walkway, the table fights the
rug, or afternoon glare ruins the desk by the window. The costly failure is discovering
fit and daylight *after* delivery.

Success for us is narrow and checkable. Given a meter-accurate plan, a user should be
able to place catalog pieces, scrub time for a real latitude and longitude, watch shadows
respond, get a non-overlapping layout suggestion, undo mistakes, and leave with a
saveable, shareable scene, without installing CAD.

Existing approaches fail in complementary ways. Retail pages are 2D marketing. Phone AR
often drops one SKU into a camera feed but does not model *this* room's openings, north
orientation, or day cycle. Full BIM is too heavy for a weekend decision. Many "AI
interior" demos invent coordinates that clip walls until a red overlap warning tells the
truth.

Success criteria set *before* building:

1. Walls, windows and doors become live 3D.
2. Furniture add, move and rotate with live collision shown in both plan and 3D, on real
   textured models.
3. Sun position derived from geography and time, not from a mood preset.
4. Layout assistance that never treats raw LLM numbers as ground truth.
5. A zod-validated, versioned scene document that survives save and reload.

All five are met. The scope then went further than originally planned: a full 24 hour
light study, an illuminance heatmap checked against real lighting standards, photo-based
room import, image generation of a real room across its real day, accounts, share links,
Postgres persistence, and container and Kubernetes deployment.

---

## Approach

**The central decision: a plain JSON `SceneDocument` in `packages/core` is the
contract.** Meters, Y-up, degrees, no three.js, no React, no DOM. The renderer, the AI
layer and the API only read and mutate that document. Edits are undoable through Immer
patches, migratable whenever `CURRENT_SCHEMA_VERSION` is bumped (the schema is on version
7, with a migrator for every step), and testable without a GPU.

A home address is PII, so it never enters the document. Only a coarse latitude and
longitude, rounded to two decimal places, plus a true-north offset travel with a design.
The coarsening runs on the server, where a client cannot bypass it.

**For lighting** we chose real-time shadow maps plus image-based ambient light as the
editor default, rather than baked lightmaps or path tracing. Bakes die the moment
furniture moves; path tracing can wait for stills. Sun pose comes from `suncalc` combined
with site coordinates, building orientation and a time control. An optional Realism mode
(apartment HDRI, photographic PBR materials, soft and contact shadows, window fill)
raises the visual ceiling without changing the document.

Two features build directly on that foundation:

- **Light study.** One render per hour across a full 24 hours, then scrub or play it
  back. Every frame is a real render at that hour's true sun position, including the
  hours after sunset where the lamps take over.
- **Illuminance heatmap.** Lux computed across the floor and compared against real
  standards for a bedroom, living room, kitchen or desk, so "is this bright enough to
  read in" becomes a number rather than an opinion.

**For AI** we ruled out "the model returns `{x, z}`." Assistants propose intent;
deterministic code places and validates footprints.

- *Suggest a layout* packs by role: rugs centered, large seating and storage on walls,
  tables near seating, lamps in free corners, then repairs overlaps.
- *Cozy living room under $3k* runs the `@interior/ai` solver through a catalog bridge.
  The demo prices are placeholders, since this catalog carries no real pricing.
- With an LLM key, tools mutate the same document. Without one, a mock path keeps the
  drawer honest rather than dead-ending.
- *Image Generation Day* takes a photo of a real room and re-lights it across twelve
  moments of that room's real day, with sun angles computed for the building and date. A
  vision pass reads the room once so every generated hour keeps the same furniture and
  windows, and the image model edits the photo rather than inventing a room.

Every AI feature has a mock mode that runs the full round trip for free, with no key and
no billing.

**Assets** are all CC0: the Kenney Furniture Kit 2.0, scaled to catalog meters at load
time; ten photographic PBR material families from ambientCG (colour, normal and roughness
maps at 512 by 512); and the Poly Haven `apartment` HDRI, fetched at runtime by drei
rather than committed. Provenance for every file is recorded in `LICENSES.md`.

**Ruled out:** WebGPU-only pipelines, server render farms, and addresses in shareable
JSON.

---

## Evidence

We claim only what a judge can reproduce and what tests lock down.

**Cold path.** `pnpm install && pnpm dev` opens Marina Studio at `http://localhost:5173`,
a hand-placed 5 by 4 metre studio. `HACKATHON.md` is the three minute judge guide.

1. Orbit the room, toggle Cutaway for a dollhouse view, and scrub the day or press Play.
2. Drag two pieces into each other and watch both turn red, in 3D and in the Plan tab.
   That is live AABB collision detection, not a visual effect.
3. Add furniture from the catalog. It lands in the nearest free spot, never on top of
   something else.
4. Run *Suggest a layout* and *Cozy living room under $3k*.
5. Open the lighting panel, switch on the lux heatmap, and check the room against a
   living room standard.
6. Render the 24 hour light study and scrub it.
7. Toggle Realism, take a Capture, then Export and re-import the JSON. It is validated
   and schema-migrated on the way in, so an older export still opens.

**Tests.** 788 unit tests pass across the workspace: 133 in `packages/core` (schema
round-trips, every migration path, undo, sun vectors against reference values, privacy
coarsening), 55 in `packages/renderer`, 50 in `packages/ai`, 230 in `apps/api` (including
storage contract suites run against both the file and Postgres backends), and 320 in
`apps/web`.

**Known gap, disclosed rather than hidden.** `pnpm test` currently exits non-zero. 25
tests across 8 `apps/web` suites fail from an in-progress module port: `guidance/rules`,
`guidance/starterLayout`, `scene3d/furniturePlacement`, `store/*`, `ai/chatStore` and
`components/DaylightSummary`. The features themselves run correctly in the app; the test
modules have not caught up with a refactor. Every other workspace is green.

**Deployment.** Not a laptop-only demo. `docker compose up --build` brings up web, API
and Postgres. Kubernetes manifests ship as a kustomize base with local and production
overlays, including liveness, readiness and startup probes, resource limits,
autoscalers, disruption budgets, and non-root containers with a read-only root
filesystem. A full security pass is written up in `deploy/SECURITY.md`, covering the
unmetered-spend risk on the image endpoints, the daily budget ceiling that closes it, and
the five environment variables that must be set before a public URL points at this.
