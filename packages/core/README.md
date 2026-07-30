# `@interior/core`

The scene document and the maths that operate on it. **Pure TypeScript** — no three.js, no
React, no DOM. If it can't run in Node, it doesn't belong here.

That constraint is what makes the rest of the system work: the renderer, the AI layer and
the API all depend on this package and none of them depend on each other.

```bash
pnpm --filter @interior/core test
pnpm --filter @interior/core build
```

## The scene document

`SceneDocument` is the contract between every other package: plain, serializable JSON,
validated by a zod schema, versioned.

```ts
import { CURRENT_SCHEMA_VERSION, migrate, sceneDocumentSchema } from '@interior/core';

const doc = migrate(JSON.parse(saved));  // validates + upgrades in one step
```

| Field | What it holds |
| --- | --- |
| `schemaVersion` | Currently **7**. |
| `site` | Coarse lat/lng and `trueNorthOffsetDeg`. **Never a street address** — see `privacy.ts`. |
| `rooms` | Walls (with thickness), floor, ceiling, per-surface materials. |
| `openings` | Windows and doors: host wall, position, size, glass, curtains/blinds. |
| `furniture` | Catalog id plus a transform, and an optional material override. |
| `fixtures` | Light fittings with physical units. |
| `view` | Camera and time of day. |

### Conventions (`units.ts`)

Meters. Right-handed, Y-up. The floor plan is on the X/Z plane, Y=0 is the floor. Angles
are **degrees** in the document and converted to radians only inside the renderer.
`site.trueNorthOffsetDeg` rotates the document's +Z toward real-world north; 0 means "+Z
is north".

Changing any of these is a breaking, migration-worthy change.

### Migrations

Every schema change bumps `CURRENT_SCHEMA_VERSION` **and** adds a migrator in
`migrations.ts`. `migrate()` walks a document from whatever version it was written at up to
current, and throws a `MigrationError` naming the version it got stuck on. Saved and shared
designs never break; this is not optional and it is enforced by tests over every version
path.

## What else is in here

| Module | Responsibility |
| --- | --- |
| `schema.ts` | The zod schema. Also the source the AI's tool schemas are derived from, so the two can't drift. |
| `migrations.ts` | Version migrators and `migrate()`. |
| `undo.ts` | Patch-based history. One logical edit — including a multi-step AI edit — is one undo step. |
| `sunlight.ts` | `sunVector(lat, lng, date, northOffset)` via suncalc, in the document's coordinate frame. Unit-tested against reference values. |
| `daylight.ts` | How much daylight actually reaches a room: aperture ratio, glass and covering transmission, doors at a reduced weight. This is what makes a windowless room dark. |
| `illuminance.ts` | Lux estimation for the heatmap and the standards readout. |
| `geometry.ts` | Room corners, areas, wall chaining. |
| `collision.ts` | AABB overlap and clearance. |
| `autolayout.ts` | The deterministic placement solver. |
| `materials.ts` | Material families and finishes shared by the renderer and the catalog. |
| `privacy.ts` | `coarsenDocumentForSharing()` — rounds coordinates to ~1 km before a document leaves the machine. |
| `roomPhoto.ts` | `RoomPhotoProposal` schema and the deterministic materializer that turns a vision-model proposal into a real document. |
| `flags.ts` | `isFeatureEnabled()`. |
| `transform.ts`, `fixtures.ts`, `color.ts`, `document.ts`, `sample.ts` | Transform helpers, fixture mounting heights, colour conversion, document construction, the sample scene. |

## Rules for changes here

1. No three.js, no React, no DOM imports. Ever.
2. Schema change → bump `CURRENT_SCHEMA_VERSION` → add a migrator → add a test for the new
   version path.
3. Nothing that could identify a home goes in the document. `site` holds coarse
   coordinates and an offset, and that's all it will ever hold.
4. Geometry and placement code is the deterministic half of the AI story. It has to be
   correct on its own, because it is what validates the model's proposals.
