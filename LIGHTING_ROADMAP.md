# Roadmap — Realistic Room Lighting

## Where we are

Natural sun (auto/manual, time/date/location/orientation, weather, exposure, warmth), a
sun-path + compass, a solar-exposure floor heatmap, an illuminance (lux) heatmap +
room-standard check (Phase 12), and **real fixture models** — ceiling/wall/floor/table,
each with Kelvin, brightness, on/off, cast-shadow, and dusk auto-ramp — plus a lighting
**scenes** system (save/apply named presets + built-in Evening/Reading/Movie) (Phase 8).

To make lighting *look* like a real room and support what real lighting *requires*, the
gaps are: proper **fixtures**, **surface materials**, **indirect (bounce) light**,
**daylight control** (curtains/blinds/glass), and **analysis** (is it bright enough?).
Phased below — each keeps the 60fps budget via quality presets, with heavy realism opt-in.

---

## Phase 8 — Light fixtures & scenes  *(how a room is actually lit)*

- **Fixture types:** ceiling downlight, pendant, chandelier, wall sconce, floor lamp,
  table lamp, spotlight, LED strip / cove.
- Fixtures are **placeable from a library**; the model and its light are linked, and they
  **mount correctly** (ceiling fixtures to the ceiling, sconces to walls, lamps on the
  floor/surfaces).
- **Per fixture:** colour **temperature (Kelvin, 2700–6500K)**, **brightness (lumens /
  dimming %)**, on/off, beam angle (spots), and cast shadows.
- **Lighting scenes:** save / name / recall setups — "Evening", "Reading", "Movie".
- **Day/night:** fixtures ramp up as daylight fades.

## Phase 9 — Surfaces & materials  *(what light lands on)*

- **Wall / floor / ceiling materials:** paint colour, finish (matte / eggshell / gloss),
  floor type (wood / tile / carpet / concrete). Hugely changes how light reads.
- **Material library** + per-surface assignment.
- **Ceilings** (rooms are open-top today) — needed for ceiling fixtures and light bounce;
  auto-hidden in the dollhouse cutaway.

## Phase 10 — Realistic light transport  *(the photoreal lever)*

- **Indirect / bounce light (GI):** real rooms are lit mostly by bounced light — via light
  probes, a baked pass, or real-time approximation.
- **Ambient occlusion** (contact shadows, SSAO/GTAO).
- **HDRI environment** for natural ambient + reflections.
- **Bloom / glare** on bright fixtures and windows.
- **"Photo mode":** a progressive **path-traced** high-quality render of the current view
  for a realistic snapshot to share (ground-truth for the real-time look).

## Phase 11 — Windows & daylight control

- **Window glass** (transmission / tint), **curtains / blinds / sheers** (open / partial /
  closed) that filter or block daylight.
- **Skylights**; real window frames / mullions.

## Phase 12 — Lighting analysis & design tools  *(what a room requires)*

- **Illuminance (lux) meter:** point-and-measure "how bright is this desk?"; a floor
  **illuminance heatmap** combining daylight + fixtures.
- **Uniformity / dark-spot** detection.
- **Recommendations vs standards** (e.g. ~300 lux living room, ~500 lux desk).
- **Glare** check; **energy** estimate (total wattage / efficacy).

## Phase 13 — Lighting UX & workflow

- **Fixture gizmos** (drag / aim in 3D); a **fixtures list / inspector**.
- Multi-select, copy/paste fixtures.
- **Before/after** and scene **snapshots** to compare.
- **Reorganize the lighting panel** into collapsible sections / tabs (it's dense now).

---

## Cross-cutting

- **Schema evolution** to persist fixtures / materials / scenes (with migrations).
- **Quality presets** scale GI / AO / shadow cost; heavy realism lives in **photo mode**.
- Keep pure, testable helpers (Kelvin→RGB, lux estimation, fixture photometry).

## Locked decisions & build order

1. **Analysis first (Phase 12)** — the functional "what a room requires" side: an
   illuminance (lux) engine, a floor lux heatmap + point meter, and "is it bright enough?"
   vs standards. Buildable now on the existing sun + lamps; gets richer as fixtures land.
2. **Real-time + opt-in photo mode** — editing stays 60fps; a "Render photo" button does a
   slow path-traced snapshot for full realism.
3. **Real fixture models (library)** — low-poly fixtures (Kenney) that look right and emit
   light.

**Order:** 12 (analysis) → 8 (fixtures & scenes) → 9 (materials & ceilings) →
11 (windows/daylight control) → 10 (GI + photo mode) → 13 (UX).
