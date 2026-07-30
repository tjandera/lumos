# `@interior/catalog`

The furniture catalog: 35 items, each with a category, a price, a model path and — most
importantly — **verified real-world dimensions in meters**.

```ts
import { catalog, getCatalogItem, type CatalogItem } from '@interior/catalog';
```

Categories: `seating`, `tables`, `storage`, `beds`, `lighting`, `decor`.

## Why dimensions are load-bearing

They aren't decorative metadata. Three separate systems depend on them being right:

- The renderer **contain-fits** each glTF to its catalog dimensions with a uniform scale,
  so a model authored at any arbitrary size ends up physically correct next to every other
  model. This is what stops a sofa and a side table looking like they came from different
  rooms.
- **Collision and clearance** use the declared footprint, not the mesh bounds.
- The **AI layout solver** reasons entirely in these numbers, and the shopping filter uses
  them for fits-through-door and fits-in-space checks.

A wrong dimension therefore doesn't just look off — it silently corrupts placement and
validation. Measure before adding.

## Adding an item

1. Record the asset's license in [`LICENSES.md`](../../LICENSES.md) first.
2. Verify the real product's dimensions.
3. Add the entry here — `width`/`height`/`depth` in meters, plus `model` pointing at the
   GLB under `apps/web/public/models/` and a `color` for the placeholder box shown while it
   loads.

See [`catalog/README.md`](../../catalog/README.md) for the asset pipeline and provenance.
