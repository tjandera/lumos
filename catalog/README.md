# Assets & licensing

Provenance for every 3D model, texture and HDRI the app ships or fetches.

**The full record is [`LICENSES.md`](../LICENSES.md) at the repo root.** Nothing gets
committed until it's listed there.

## What ships today

| | Count | Size | Where | License |
| --- | --- | --- | --- | --- |
| Furniture & fixture models | 29 GLB | 4.9 MB total | `apps/web/public/models/` | CC0-1.0 |
| Poly Haven models | 30 GLB | *(included above)* | `apps/web/public/models/ph/` | CC0-1.0 |
| PBR texture families | 10 × 3 maps | 1.2 MB | `apps/web/public/textures/` | CC0-1.0 |
| Draco decoder | — | — | `apps/web/public/draco/` | Apache-2.0 |
| `apartment` HDRI | 1 | — | fetched at runtime | CC0-1.0 |

Sources: [Poly Haven](https://polyhaven.com) (models), [ambientCG](https://ambientcg.com)
(textures), [Kenney](https://kenney.nl) (the original low-poly set). All CC0 — public
domain, no attribution required, though it's appreciated.

The texture families are wood-oak, wood-walnut, wood-floor, fabric-wool, fabric-linen,
leather, marble, plaster, carpet and metal; each ships albedo, normal and roughness maps.
`apps/web/public/textures/manifest.json` maps family → files → upstream asset id.

## Where the catalog actually lives

`packages/catalog/src/index.ts` — 35 items with real-world dimensions, categories, prices
and model paths. That's what the app reads.

> **Note:** `manifest.json` in this directory is a vestigial 2-item stub from Phase 0 with
> `TBD` license fields. Nothing reads it. Treat `packages/catalog` as the source of truth
> and `LICENSES.md` as the licensing record; the stub is kept only so the Phase-0 history
> stays legible, and should be either regenerated from the real catalog or deleted.

## The model pipeline

[`scripts/fetch_models.py`](../scripts/fetch_models.py) is the reproducible path from Poly
Haven to what's committed: download, resize textures to 512 px, Draco-compress geometry.
That's how 30 assets fit in 4.5 MB. Re-run it rather than hand-editing GLBs.

Draco decoding is **self-hosted** from `apps/web/public/draco/` rather than drei's default
Google CDN path — no third-party request on load, and it works offline and under a strict
CSP.

## Adding an asset

1. Confirm the license is CC0 or otherwise permissive, and that you can name the author.
2. Add a row to [`LICENSES.md`](../LICENSES.md) **before** committing the file.
3. Verify real-world dimensions, then add the catalog entry in
   `packages/catalog/src/index.ts`. Dimensions are load-bearing: the renderer contain-fits
   each model to them, and collision uses them.
4. Prefer extending `scripts/fetch_models.py` over a manual download, so the next person
   can reproduce it.
