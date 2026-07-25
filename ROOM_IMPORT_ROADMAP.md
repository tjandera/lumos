# Roadmap — Photo-Based Room Import

## Where we are

Upload a photo of a real room and the app proposes an approximate 3D layout — a
rectangular room shell, windows/doors, wall & floor materials, furniture, and light
fixtures — as a real `SceneDocument`, ready to refine with the exact same tools used for
a hand-drawn room (drag walls/openings in Plan view, edit materials, drag fixtures). Right
after import, the Lighting panel's Location and Orientation sections force themselves
open with a one-time callout, so the sunlight simulation gets pointed at the room's real
site and facing instead of a placeholder. If the photo carries GPS in its EXIF data,
that's offered as a one-click location prefill — read entirely client-side, never
uploaded, same coarse-lat/lng-only handling the app already applies everywhere else.
Furniture and light fixtures the photo shows are both detected in one pass; anything that
doesn't match our small low-poly catalog is dropped and reported rather than forced into
a wrong-looking placement (Phases 14–17).

This sits behind its own flag (`roomPhoto`, off by default — set `VITE_FEATURE_ROOM_PHOTO=true`
in `apps/web/.env.local`), the same pattern as the AI assistant.

## Why a phase, not a paragraph

Single-photo 3D reconstruction is an open computer-vision problem in general — no camera
calibration, no reference object, real scale is fundamentally ambiguous, and anything
behind the camera or behind furniture is invisible. The honest framing throughout this
feature is **estimate to refine, not measurement** — the UI says this explicitly, and the
architecture treats the vision model exactly like the existing furniture-placement AI:
it proposes; deterministic code validates, clamps, and places. See
`packages/core/src/roomPhoto.ts`.

## Architecture

- **`packages/core/src/roomPhoto.ts`** — `RoomPhotoProposalSchema` (zod): a deliberately
  narrow shape the model may propose (axis-aligned rectangular room only, not arbitrary
  polygons). `materializeRoomPhoto()` is a pure, fully unit-tested function that turns a
  proposal into a real `SceneDocument`: re-clamps every dimension regardless of the zod
  bounds already applied (defense in depth), keeps openings within their host wall, maps
  furniture categories to catalog ids (dropping unmatched ones), and — if anything
  overlaps — relays out the **entire** furniture set with the same deterministic
  perimeter solver `suggestLayout` already uses for "Suggest a layout". (Repositioning
  only the colliding subset isn't enough on its own — a relocated piece can still land on
  an untouched one; caught by a regression test with a 3rd, otherwise-fine item.)
- **`apps/api`** (new) — a minimal Fastify server, one route
  (`POST /analyze-room-photo`), because the vision call needs a real API key that must
  never reach the browser bundle. Sends the photo + a prompt to OpenAI with JSON-mode
  output, validates the response against the same `RoomPhotoProposalSchema` (a model
  response that doesn't fit throws a clean error — never propagated raw), then
  materializes server-side and returns a ready `SceneDocument`. A `ROOM_PHOTO_MOCK=true`
  dev flag returns a canned proposal without calling OpenAI at all, which is how this was
  fully exercised end-to-end in this environment (no real API key available here).
  `apps/web`'s Vite dev server proxies `/api/*` to it, so there's no CORS setup to
  maintain.
- **`apps/web`** — `RoomImportPanel` (upload + preview + analyze), `ReferencePhotoPanel`
  (the uploaded photo pinned as a comparison reference, available in either view mode),
  `ImportSummaryBanner` (skipped-furniture + model notes), and a `justImportedRoom` flag
  that forces the Lighting panel's Location/Orientation sections open once with a
  dismissible callout.

## Running it

- `apps/api/.env.example` → copy to `apps/api/.env`, set `OPENAI_API_KEY`. `pnpm dev` at
  the repo root now starts both `apps/web` and `apps/api` together (turborepo picks up
  the new package's `dev` script automatically).
- Without a key, set `ROOM_PHOTO_MOCK=true` in `apps/api/.env` instead — full pipeline,
  no OpenAI usage/cost, useful for developing the UI in isolation.

## Deferred

- **Multi-photo / panorama input** — one photo only for now; several photos of the same
  room (or a 360° pano) would meaningfully improve the room-shape guess but need their
  own reconciliation step across images.
- **Non-rectangular rooms** — L-shapes, bays, etc. The schema is deliberately restricted
  to a rectangle for v1; extending it is a schema + prompt + materializer change, not a
  rearchitecture.
- **A dedicated "how confident is this" view** — per-item confidence is captured
  (`RoomPhotoFurnitureSchema.confidence`) but not yet surfaced in the UI (e.g. dimming
  low-confidence placements).
- **A real backend beyond this one route** — `apps/api` is intentionally minimal (no
  auth, no persistence); the original plan's fuller backend (designs CRUD, share links)
  remains future work, unaffected by this addition.
