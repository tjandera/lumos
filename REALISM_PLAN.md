# Plan — High-Fidelity Models & Advanced Lighting

## Context

The MVP (Phases 0–4) is done: draw → furnish → light → arrange, with placeholder-box
furniture and a single time-driven sun. This plan adds the two things asked for:

1. **High-fidelity 3D furniture** — real GLB models instead of boxes.
2. **A detailed, adjustable lighting system** — control the light's direction/intensity/
   color, **see the sun in the 3D space**, and study how the room looks under natural
   light (times of day, seasons, sky conditions).

> Downloading any 3D model / HDRI asset happens **only after you approve** the specific
> source + licensing. Everything committed gets recorded in `LICENSES.md`.

## Researched model sources

| Source | License | Look | Notes |
|---|---|---|---|
| **Poly Haven** | CC0 (no attribution) | Photoreal PBR | Best for high fidelity; also CC0 HDRIs for natural lighting |
| FurniMesh | Free commercial | Mixed | Huge library (7k+), self-contained GLBs |
| Kenney / Quaternius / Eclair | CC0 | Stylized low-poly | Tiny + fast, very consistent look |
| Open Source 3D Assets | CC0 | Mixed | ~1k GLBs, GitHub-hosted |

---

## Phase 6 — High-fidelity furniture (real GLB models)

**6.1 Loading pipeline**
- Configure `useGLTF` (drei) with **Draco** (geometry), **KTX2/Basis** (textures), and
  **Meshopt** decoders. One shared loader config.
- `FurnitureModel` component: React `Suspense` with a **ghost-box fallback** (reuses
  today's box) while loading, and a per-model error boundary so one bad asset can't crash
  the scene.

**6.2 Catalog upgrade (schema-safe)**
- Extend `CatalogItem`: `model` (GLB url/path), `thumbnail`, `license` (spdx/source/author),
  and a **pivot/anchor convention** (model recentred so its footprint sits at y=0, facing +Z).
- Keep `width/height/depth` as the **authoritative real-world size**; models are scaled to it.

**6.3 Asset normalization**
- A small script to: recenter each model to the floor, scale to catalog dimensions,
  compress (Draco + KTX2), and emit a thumbnail. Store curated GLBs in
  `apps/web/public/models/` (small set) with a documented "add a model" flow.

**6.4 Rendering & performance**
- Real PBR materials (correct color space); environment reflections (ties into 7.x HDRI).
- **Instancing** for repeated items; frustum culling; lazy-load per catalog item.
- Extend the perf HUD budget (texture MB, loaded models); **quality presets** cap texture
  resolution on lower tiers.
- Collision keeps using catalog dimensions (stable), with the option to derive from the
  model's real AABB.

**6.5 Curated catalog**
- ~15–20 licensed items across seating / tables / storage / beds / decor, each recorded
  in `LICENSES.md`. Placeholder boxes remain the fallback for any item without a model.

---

## Phase 7 — Advanced lighting & a visible, adjustable sun

**Schema v3 (with migration + tests):** richer lights, sun settings, building orientation,
and environment — all persisted in the `SceneDocument`.

**7.1 Sun / natural light controls** (a dedicated Lighting panel)
- **Time of day** (have) · **date** (season changes the sun's path) · **location**
  (lat/lng, plus address → geocode) · **building orientation / true-north** (compass dial).
- **Sun mode:** *Auto* (computed from time + location) ↔ *Manual* (azimuth + elevation
  sliders, or **drag the sun** directly in the sky).
- **Intensity & color temperature** overrides; toggle sun and shadows on/off.

**7.2 See the sun in 3D** (the headline ask)
- A **glowing sun disc** (with bloom) rendered at the real sun position, moving live as you
  scrub time or drag it.
- A **sun-path arc** — the track the sun follows across the chosen day at your location,
  with hour ticks — a proper *sun study*.
- A ground **compass / north indicator**.

**7.3 Natural-lighting realism**
- **HDRI image-based lighting** (Poly Haven CC0) for realistic ambient + reflections;
  toggle **procedural sky ↔ HDRI**.
- **Sky / weather presets:** clear · partly cloudy · overcast · golden hour → drive sun
  intensity, color, shadow softness, and ambient.
- **Time presets** (8am / noon / 5pm / golden hour) and an optional **auto-sweep** to watch
  shadows move across the room.

**7.4 Artificial / interior lights**
- A **lights list**: add / remove / select **point & spot** lamps.
- Per-lamp: **move gizmo** in 3D, intensity, **color/temperature**, on/off, and for spots:
  cone angle, penumbra, target/direction.

**7.5 Global look**
- **ACES tone mapping** + exposure, ambient level, shadow quality (map size / contact
  shadows / ambient occlusion), and **Low/Med/High quality presets** to protect 60fps.

---

## Cross-cutting

- **Schema v3 migration** (v2 → v3) with tests; unit tests for sun auto/manual math and any
  new pure helpers.
- **Quality presets** so realism never silently breaks the frame budget.
- `LICENSES.md` updated for every model + HDRI.

## Verification

typecheck + all tests green · production build · browser walkthrough: load real GLB
furniture; switch sun Auto↔Manual and drag it; watch the **sun disc + path** track the
day; toggle **HDRI natural lighting** and sky presets; add and tune a lamp; confirm quality
presets hold the FPS budget.

## Locked decisions

1. **Furniture models:** stylized **low-poly CC0** (Kenney Furniture Kit / Quaternius) —
   tiny, fast, consistent. (Poly Haven photoreal remains an easy later swap per item.)
2. **Sun control:** **both** realistic (time/date/location/orientation) **and** manual
   (drag the sun / azimuth + elevation sliders).
3. **Realism target:** **adaptive quality presets** (Low/Med/High) so realism scales to
   the device and never breaks 60fps.

## Build order

Lighting (Phase 7) first — it needs no downloads and is the main ask. Then models
(Phase 6) once the specific asset pack is approved for download.

---

## Phase 6 revisited — two fidelity paths

- **6A · Procedural furniture (no download):** compose each catalog item from primitives
  so it reads as real furniture (sofa = base + back + arms + cushions; table = top + 4
  legs; chair = seat + back + legs; bed = frame + mattress + pillows; bookshelf = sides +
  shelves; lamp = base + pole + shade). Driven by catalog dimensions; instanced; a large
  fidelity jump with zero assets. Can ship immediately.
- **6B · Kenney GLB models (download-gated):** real CC0 low-poly GLBs via a Draco/KTX2
  loader; boxes/procedural remain the loading fallback. Needs approval to download.

6A and 6B stack: procedural is the always-available baseline; GLBs override per item when
present.

---

## Phase 7 — Sunlight, expanded (detailed, phased)

Already shipped: auto/manual sun, time-of-day slider, intensity, Low/Med/High quality,
visible sun disc, **sun-path arc**, ground **compass**.

**7A · Real sun context (accuracy)**
- Date picker (season changes the sun's height + path length).
- Location: lat/lng fields + address → geocode; times resolved in the site's timezone.
- Building orientation / true-north dial (rotate the model relative to north).
- Daylight readout: sunrise, sunset, and daylight hours for the date + location.
- Persist all lighting in the `SceneDocument` (schema **v3** + migration + tests).

**7B · Sun-study tools (watch the light move)**
- Animate the sun across the day (play/pause + speed) to sweep the shadows.
- Time presets: sunrise · morning · noon · golden hour · sunset.
- "Frame the sun" camera button (tilts up to the sky dome / sun-path).
- Seasonal comparison: overlay summer vs winter sun paths.

**7C · Light quality & mood**
- Sky/weather presets: clear · hazy · overcast · golden hour (drive turbidity, shadow
  softness, colour, ambient; overcast = soft, near shadow-less).
- Sun colour-temperature + shadow-softness sliders.
- Exposure + ACES tone mapping.
- HDRI image-based natural lighting (optional; small CC0 HDRI — download-gated).
- Sun bloom / glare (post-processing).

**7D · Interior / artificial lights (complement daylight)**
- Add / remove / select point & spot lamps; per-lamp intensity, colour/temperature,
  on/off, spot cone + penumbra; 3D move gizmos; lamps auto-on at low sun.

**7E · Natural-light analysis (the standout feature)**
- **Solar-exposure heatmap** on the floor: accumulated direct sunlight over the day →
  "which corner gets morning sun, which stays bright at 5pm".
- **Direct-sun highlight**: flag furniture/areas currently lit by the sun.

Each phase unit-tests the pure math (sun times, exposure sampling) and keeps the quality
presets protecting the 60fps budget.
