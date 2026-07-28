# Asset Licenses

Every third-party 3D model, texture, or HDRI in the app is listed here. Prefer CC0 /
permissive assets. **Do not commit an asset until its license is recorded here.**

## Furniture models

All furniture GLBs under `apps/web/public/models/` are from the **Kenney "Furniture
Kit" (2.0)** pack.

| Asset | License (SPDX) | Source | Author |
| --- | --- | --- | --- |
| Furniture Kit 2.0 (sofa, chairs, tables, bed, bookcase, desk, TV stand, lamp, plant, rug, …) | CC0-1.0 | https://kenney.nl/assets/furniture-kit | Kenney (www.kenney.nl) |

## Environment HDRI (Realism mode, loaded at runtime)

| Asset | License (SPDX) | Source | Author | Notes |
| --- | --- | --- | --- | --- |
| `apartment` (1k HDR) | CC0-1.0 | Poly Haven via `@react-three/drei` `<Environment preset="apartment" />` | Poly Haven | Not committed to the repo — fetched by drei when Realism is on. https://polyhaven.com/a/apartment |

Procedural fabric / wood / plaster / carpet textures used in Realism mode are generated
in-browser (CanvasTexture) and are original to this project (no third-party files).

CC0 = public domain, no attribution required (credit appreciated). Models were copied
from the pack's `Models/GLTF format/*.glb`, renamed to their catalog IDs; the renderer
recenters and scales each to its real-world catalog dimensions at load time.

Second batch (same pack, downloaded fresh from the same source above), renamed from
their original Kenney filenames:

| Catalog ID | Source model |
| --- | --- |
| `sofa-3seat` | `loungeSofaLong.glb` |
| `lounge-chair` | `loungeChair.glb` |
| `bar-stool` | `stoolBar.glb` |
| `round-table` | `tableRound.glb` |
| `corner-desk` | `deskCorner.glb` |
| `wardrobe` | `bookcaseClosedDoors.glb` |
| `bed-single` | `bedSingle.glb` |
| `plant-small` | `plantSmall1.glb` |
| `rug-round` | `rugRound.glb` |
| `coat-rack` | `coatRackStanding.glb` |

## Light fixture models

Same pack, additional files, used for `doc.lights[].kind` mounts (ceiling/wall/table —
`floor` reuses the furniture catalog's `floor-lamp.glb` above):

| File | Source model | Mount |
| --- | --- | --- |
| `fixture-ceiling.glb` | `lampSquareCeiling.glb` | ceiling |
| `fixture-wall.glb` | `lampWall.glb` | wall |
| `fixture-table.glb` | `lampRoundTable.glb` | table |

---

## Assets from the launchpad codebase (Darlene)

# Third-party asset licenses

Tracks every non-code, non-original asset shipped in this repo and its
license, per the locked decision in `IMPLEMENTATION_PLAN.md` ("Furniture
catalog → curated CC/free seed set... secured with a `LICENSES.md` so
licensing can't block later phases").

## Shipped assets

| File | Source | Author | License | Notes / modifications |
|---|---|---|---|---|
| `apps/web/public/models/test-box.glb` | Generated locally by `apps/web/scripts/generate-placeholder-glb.mjs` (no external source — pure Node, no dependencies) | n/a (procedural) | Public domain / CC0 equivalent (originally authored for this repo) | **Not a licensed third-party furniture asset.** A 1.6 KB unit box with correct normals + a flat PBR material, generated to prove the `modelUrl` → GLTF-load → bbox-fit → primitive-fallback pipeline end-to-end (see "Why no real assets shipped" below). Wired to the `coffee-table` catalog item (`apps/web/src/catalog/catalogData.ts`) as a visible, working example. Validated with `apps/web/scripts/validate-glb.mjs` and confirmed to parse correctly with three.js's own `GLTFLoader`. |

No other binary assets are shipped. Every other catalog item continues to
render as a parametric primitive (`apps/web/src/scene3d/FurnitureMesh.tsx`'s
`PrimitiveFurnitureMesh`), exactly as before this change.

## Why no real licensed GLBs shipped this pass

This sandbox's outbound network goes through a proxy with a small domain
allowlist. Reachability, tested directly (`curl` from the shell, and
separately via the `web_fetch` tool, which turned out to use a different
egress path):

| Domain | Reachable? | How tested | Notes |
|---|---|---|---|
| `api.polyhaven.com` | **Yes** (JSON only) | `web_fetch` tool | Full asset index + per-asset file manifests (download URLs, authors, licenses) fetched successfully — see below. |
| `dl.polyhaven.org` (Poly Haven's binary CDN) | **No** | `curl`: `403 blocked-by-allowlist`. `web_fetch`: connection succeeds but returns an empty body (non-HTML/JSON content type isn't surfaced by that tool). | No path to actual model/texture bytes. |
| `github.com` | Partial (HTML pages only) | `curl`: `200` | Repo/release **pages** load, but `git`/redirect targets don't. |
| `raw.githubusercontent.com`, `codeload.github.com`, `objects.githubusercontent.com` (paths), `release-assets.githubusercontent.com`, `media.githubusercontent.com` | **No** | `curl`: `403 blocked-by-allowlist` on every one | Rules out the Khronos `glTF-Sample-Models` repo (raw file links and release/zip downloads both redirect through these) and any GitHub-hosted asset mirror. |
| `cdn.jsdelivr.net`, `unpkg.com`, `raw.githack.com`, `cdn.statically.io`, `sketchfab.com`, `kenney.nl`, `storage.googleapis.com`, `fonts.googleapis.com`, `threejs.org` | **No** | `curl`: `403 blocked-by-allowlist` | No alternate CDN mirror worked either. |
| `registry.npmjs.org` | **Yes** (full tarball downloads, not just metadata) | `curl` + `npm install` / `pnpm install` | The only channel that can move real binary payloads into the sandbox. Searched for any npm package bundling real furniture GLBs (`@pmndrs/assets` — CC0, but only ships `bunny.glb`, `suzi.glb` (Suzanne), and a logo mark; no furniture-shaped geometry) — nothing suitable found. |

**Conclusion: the two Poly Haven/Khronos sources named in the task, and every
other binary-asset host tried, are unreachable from this environment.** Only
JSON metadata (via `api.polyhaven.com`) and npm registry tarballs are
reachable — neither can deliver real furniture `.glb`/texture bytes. Per the
task's documented fallback ("If NO downloads succeed: still build the
modelUrl pipeline... with a tiny procedurally-generated test GLB"), that's
what was built and wired end-to-end; see "Pipeline proof" below.

## Poly Haven asset research (ready to drop in once network access allows)

`api.polyhaven.com` **was** reachable and returned full metadata — including
exact download URLs — for Poly Haven's furniture set (`GET
/assets?type=models&categories=furniture`, 85 results, all **CC0**). The
following candidates were matched against the existing static catalog
(`apps/web/src/catalog/catalogData.ts`) by shape/category, matching the
task's "chair → chair" instruction rather than inventing new items:

| Catalog id | Poly Haven slug | Asset name | Author | License |
|---|---|---|---|---|
| `sofa-3seat` | `sofa_02` | Sofa 02 | Kirill Sannikov | CC0 |
| `armchair` | `modern_arm_chair_01` | Modern Arm Chair 01 | Vibrant Nordic | CC0 |
| `dining-chair` | `dining_chair_02` | Dining Chair 02 | James Ray Cock | CC0 |
| `coffee-table` | `modern_coffee_table_01` | Modern Coffee Table 01 | Amin | CC0 |
| `dining-table` | `dining_table` | Dining Table | Aron Łyczek | CC0 |
| `bed-single` / `bed-double` | `GothicBed_01` | Gothic Bed 01 | Kirill Sannikov | CC0 |
| `wardrobe` | `modern_wooden_cabinet` | Modern Wooden Cabinet | Patrik Pangerl | CC0 |
| `bookshelf` | `wooden_display_shelves_01` | Wooden Display Shelves 01 | James Ray Cock | CC0 |
| `desk` | `metal_office_desk` | Metal Office Desk | Ulan Cabanilla | CC0 |
| `tv-stand` | *(no good match in the furniture set — Poly Haven has no TV stand/media console as of this search; leave as primitive, or revisit)* | | | |
| `floor-lamp` | *(not searched — Poly Haven lamps live outside the `furniture` category; re-run `GET /assets?type=models&categories=lighting` from an environment with CDN access)* | | | |

All 85 furniture-category results (slug/name/categories/tags) are reproducible
via `GET https://api.polyhaven.com/assets?type=models&categories=furniture`.

### Fully resolved example (`dining_chair_02`) — exact file manifest already fetched

`GET https://api.polyhaven.com/files/dining_chair_02` returned, among other
formats, a ready-to-use 1k glTF (small textures, per the task's "1k textures
suffice" guidance):

- glTF: `https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/dining_chair_02/dining_chair_02_1k.gltf`
- Shared `.bin`: `https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/dining_chair_02/dining_chair_02.bin`
- Diffuse (1k): `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/dining_chair_02/dining_chair_02_diff_1k.jpg`
- Normal GL (1k): `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/dining_chair_02/dining_chair_02_nor_gl_1k.jpg`
- ARM (occlusion/roughness/metalness packed, 1k): `https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/dining_chair_02/dining_chair_02_arm_1k.jpg`

### How to add a real licensed asset once these URLs are reachable

1. Download the `.gltf` + `.bin` + referenced texture files for a slug above
   (or convert to `.glb` with `gltf-transform`/Blender — a single binary file
   is simpler to ship and matches this project's "GLB" convention).
2. `cd apps/web && node scripts/validate-glb.mjs public/models/<file>.glb`
   — confirms it's structurally valid glTF 2.0 before it ships.
3. Optimize (recommended, keeps each file well under the ~4 MB budget):
   `pnpm add -D @gltf-transform/cli` (works — `registry.npmjs.org` is
   reachable), then:
   ```sh
   npx gltf-transform draco public/models/<file>.glb public/models/<file>.glb
   npx gltf-transform resize --width 1024 --height 1024 public/models/<file>.glb public/models/<file>.glb
   ```
4. Place the result at `apps/web/public/models/<file>.glb` (served at
   `/models/<file>.glb` by Vite's static `public/` convention — already
   proven by `test-box.glb`).
5. Set `modelUrl: "/models/<file>.glb"` on the matching entry in
   `apps/web/src/catalog/catalogData.ts` (replace the current
   `test-box.glb` placeholder on `coffee-table`, and add it to any other
   items from the mapping table above). Mirror onto
   `apps/api/src/catalog/data.ts` (same `modelUrl` field, added to
   `apps/api/src/catalog/types.ts`) if the item should also carry its model
   through the API-served catalog.
6. Add this asset's row to the "Shipped assets" table at the top of this
   file (source URL, author, license, any modifications).
7. No other code changes needed — `FurnitureMesh` picks up `modelUrl`
   automatically (loads it, fits it to the catalog item's `dimensions`,
   enables shadows) and falls back to the primitive builder on any error.

## Pipeline proof (what *is* wired and tested today)

- `apps/web/src/scene3d/modelFit.ts` — pure function computing a uniform
  scale + floor-centered translation from a model's bounding box to a
  catalog item's `{w, d, h}` dimensions. Unit-tested in
  `modelFit.test.ts` (7 cases: uniform scale-up, binding-axis selection,
  centering, floor-resting, a realistic off-center chair-shaped bbox, and
  two degenerate-bbox guards).
- `apps/web/src/scene3d/FurnitureMesh.tsx` — `FurnitureMesh` now accepts an
  optional `modelUrl`. When present, `GltfFurnitureMesh` loads it via drei's
  `useGLTF` (Suspense), fits it with `computeFitTransform`, and sets
  `castShadow`/`receiveShadow` on every mesh. A class `GltfErrorBoundary`
  plus `Suspense` both fall back to the original parametric primitive
  builder (`PrimitiveFurnitureMesh`, unchanged) on any load error or while
  loading. No `modelUrl` → primitive path unchanged from before.
- `apps/web/src/catalog/catalogData.ts` / `apps/api/src/catalog/types.ts` /
  `apps/web/src/api/client.ts` — all gained an optional `modelUrl?: string`
  field, flowing through `reconcileCatalog` untouched (covered by new tests
  in `catalogData.test.ts`).
- `apps/web/src/scene3d/Scene3D.tsx` and `apps/web/src/viewer/ShareViewer.tsx`
  — both pass `catalog?.modelUrl` through to `FurnitureMesh`, so the editor
  and the read-only share viewer share the same GLB/fallback path.
- Verified end-to-end: `pnpm -w install && pnpm -w typecheck && pnpm -w test
  && pnpm -w build && pnpm -w lint`, all green (see the task's final report
  for the full command output), plus a standalone check that three.js's own
  `GLTFLoader` parses `test-box.glb` without error and reports the expected
  1×1×1 bounding box.
