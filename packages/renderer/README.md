# `@interior/renderer`

Turns a `SceneDocument` into a React Three Fiber scene. Everything about how the room
*looks* lives here; everything about what the room *is* lives in `@interior/core`.

```bash
pnpm --filter @interior/renderer test
```

## Entry points

```tsx
import { SceneView, RoomScene, LightingRig } from '@interior/renderer';
```

- **`SceneView`** — the whole scene: room shell, furniture, fixtures, lighting rig,
  environment.
- **`RoomScene`** — walls, floor, ceiling and openings alone.
- **`LightingRig`** — sun, sky, ambient and interior fixtures, driven by the document's
  site and time of day.

## How the room gets built

**Walls** (`wallGeometry.ts`) are extruded from a `THREE.Shape` with the openings punched
as holes, rather than by boolean CSG. Rectangular openings are the overwhelmingly common
case and this is both faster and far more numerically stable; CSG stays the fallback for
anything else.

**Trim** (`Trim.tsx`) generates skirting boards, window sills and door architraves from the
same wall data. Small detail, disproportionate effect — bare wall/floor junctions are one
of the strongest "this is a 3D model" cues.

**Materials** (`realismMaterials.ts`, `pbrTextures.ts`) resolve in a deliberate order:

1. If the glTF ships authored PBR maps, use them and don't touch them.
2. Otherwise map the catalog category to one of 10 photographed CC0 families (oak, walnut,
   wool, linen, leather, marble, plaster, carpet, metal, wood flooring) and load
   albedo/normal/roughness.
3. Only if neither is available, fall back to a procedural texture.

`hasAuthoredMaps()` is what keeps step 1 from being clobbered by step 2.

**UVs** (`boxUVs.ts`) are box-projected in *world units*, so wood grain and weave stay at a
consistent physical scale whether they're on a side table or a wardrobe. Geometry is cloned
before UVs are written, because the glTF loader cache is shared and writing in place would
corrupt every other instance of that model.

**Fitting** (`modelFit.ts`) contain-fits each model to its catalog dimensions with a
uniform scale — the minimum of the three axis ratios. Uniform, so nothing is stretched;
contain rather than cover, so nothing overflows its declared footprint and breaks
collision. This is what makes a sofa and a side table look like they belong in the same
room.

**Lighting** (`lighting/`) computes the sun direction from the document's site, date and
north offset, and dims interior daylight by the aperture reach that
`@interior/core`'s `daylight.ts` derives. A room with no windows and no lamps goes dark,
which is the point.

## Performance notes

- Draco decoding uses a **self-hosted** decoder at `/draco/`, not drei's default Google CDN
  path. No third-party request on load, and it works offline and behind a strict CSP.
- Fades (cutaway walls, ceiling) call `invalidate()` so animation still runs under
  `frameloop="demand"`. Without it the fade would stall on the first frame.
- Post-processing is driven imperatively against the `postprocessing` package rather than
  through `@react-three/postprocessing`, which couples tightly to React majors and broke
  under R3F v9.

## Testing

Geometry, trim, box UVs, fit transforms and lighting maths are all deterministic and
unit-tested. Visual output is verified by screenshot diff in a pinned environment only —
GPU differences make unpinned render tests worse than no tests.
