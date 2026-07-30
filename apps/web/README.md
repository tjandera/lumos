# `@interior/web`

The client. Vite + React 19 + React Three Fiber v9 + Tailwind, with Zustand + Immer for
state.

```bash
pnpm --filter @interior/web dev     # http://localhost:5173
pnpm --filter @interior/web test
```

## First run

A guided 8-step tour opens automatically the first time (`tour/`). Steps point at real
controls through `data-tour` attributes and are measured live, so the highlight follows the
UI instead of drifting from hard-coded positions; a step whose target isn't on screen is
dropped rather than pointing at nothing. It's replayable from the **Tour** button, and the
overlay is click-through — you can start dragging furniture mid-tour.

If you add a control worth teaching, give it a `data-tour="..."` attribute and add a step
to `tour/steps.ts`.

## Keyboard

| Key | Does |
| --- | --- |
| `1` / `2` | 3D view / Plan view |
| `W` `A` `S` `D` | Fly the camera |
| `Q` / `E` | Down / up |
| `R` | Rotate selection 15° |
| `C` | Cutaway (dollhouse) |
| `L` | Lighting panel |
| `Space` | Play/pause the day |
| `Ctrl/⌘+Z`, `Ctrl/⌘+Y` | Undo / redo |
| `Ctrl/⌘+D` | Duplicate selection |
| `Delete` | Delete selection |
| `Esc` | Clear selection |

## Layout

| Path | What |
| --- | --- |
| `App.tsx` | Shell, toolbar, panel composition, first-run tour trigger. |
| `Scene3D.tsx` | The R3F canvas: frameloop policy, dpr cap, capture wiring. |
| `PlanEditor.tsx` | 2D floor plan — walls, openings, fixture placement. |
| `tour/` | The guided walkthrough (`steps.ts` is pure data + geometry, unit-tested). |
| `location/` | Leaflet map picker, Nominatim geocoding, north-offset bearing maths. |
| `LightStudy.tsx`, `LightStudyPanel.tsx` | 24-hour render capture, scrubber, playback, AI re-light presets. |
| `LightingPanel.tsx`, `MaterialsPanel.tsx`, `CatalogPanel.tsx`, `AIPanel.tsx` | The control panels. |
| `perf/` | Device tiering, adaptive quality, frame sampling, HUD, WebGL context-loss recovery. |
| `perfProfile.ts` | Startup capability detection → quality tier, pixel-ratio cap, power preference. |
| `QualityGovernor.tsx` | Runtime bidirectional quality adaptation. |
| `scene3d/`, `catalog/`, `api/`, `ai/` | Furniture meshes and placement, catalog UI, API client, chat client. |

## Two things that will bite you

**The API URL is baked in at build time.** `VITE_API_URL` is substituted by Vite into the
bundle. Setting it as a runtime container environment variable does nothing — see
[`deploy/README.md`](../../deploy/README.md#the-build-time-api-url).

**The canvas needs `preserveDrawingBuffer`.** Without it, `toDataURL` returns a fully black
image — WebGL is free to clear the buffer after compositing. Both Capture and the light
study read the canvas back, so this is load-bearing and easy to break by "cleaning up"
canvas options.

## Performance

The frame loop is `demand` by default — nothing renders unless something changed — and
switches to `always` only while a capture or light study is running. That single choice is
most of the difference between a quiet laptop and a loud one.

On top of it: a startup device tier from the GPU string, core count, memory and pixel
ratio; a pixel-ratio cap of 1–2× so a Retina display doesn't quadruple the fragment load;
and a governor that moves quality *both* directions at runtime to hold 30–60 fps.
`prefers-reduced-motion` is respected.

The perf HUD (top right) shows live frame time, draw calls and triangles.

## Testing

`vitest` with `globals: false`, which means **testing-library's automatic cleanup never
registers**. Call `cleanup()` explicitly in component tests or panels will accumulate
across cases and produce confusing multiple-match failures.

Known gap: `guidance/`, `store/`, `ai/chatStore` and `components/DaylightSummary` carry
failing tests from an in-progress module port. They are tracked separately and unrelated to
the shipped feature set.
