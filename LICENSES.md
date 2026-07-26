# Asset Licenses

Every third-party 3D model, texture, or HDRI in the app is listed here. Prefer CC0 /
permissive assets. **Do not commit an asset until its license is recorded here.**

## Furniture models

All furniture GLBs under `apps/web/public/models/` are from the **Kenney "Furniture
Kit" (2.0)** pack.

| Asset | License (SPDX) | Source | Author |
| --- | --- | --- | --- |
| Furniture Kit 2.0 (sofa, chairs, tables, bed, bookcase, desk, TV stand, lamp, plant, rug, …) | CC0-1.0 | https://kenney.nl/assets/furniture-kit | Kenney (www.kenney.nl) |

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
