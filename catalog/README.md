# Furniture Catalog

`manifest.json` is the source of truth for catalog items: id, display name, category,
real-world dimensions (meters), and license metadata. The renderer sizes placeholder
boxes from these dimensions today; the GLB pipeline (Draco geometry + KTX2 textures)
and thumbnails arrive in the catalog phase.

## Seed set (curated, CC/free)

MVP uses a small, hand-picked set of properly-licensed models with **verified
real-world dimensions**. Candidate sources: Poly Haven (CC0), Kenney, and CC0/CC-BY
models on Sketchfab. Every model committed here must also be recorded in the repo-root
`LICENSES.md`.

Model files (`.glb`) are **not yet committed** — they require sourcing and license
review first (and downloading assets needs an explicit go-ahead).
