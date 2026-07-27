# Judge guide — Marina Studio

A 3-minute path through the app for anyone judging this without prior context. See
`README.md` for the full feature list and `CLAUDE.md`/`IMPLEMENTATION_PLAN.md` for how
it's built.

## Run it

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173. You'll land in **Marina Studio**, a furnished 5×4m studio
apartment (sofa, coffee table, armchair, side table, floor lamp, bookshelf, plant, rug —
placed by hand so nothing overlaps) with a wide south-facing window, a floor lamp, and a
ceiling light already in place. A one-time tips card in the top-center points out the
shortcuts below; dismiss it any time.

## The 3-minute tour

1. **Look around.** Drag to orbit, scroll to zoom. Toggle **Cutaway** (toolbar) to fade
   the near walls for a dollhouse view. Scrub **Time of day** (bottom-center) or hit
   **Play day** to watch the sun move — try the **Dawn / Noon / Golden / Dusk / Night**
   presets for an instant mood change.
2. **Rearrange furniture.** Click any piece to select it — a status pill (top-center)
   shows its name, footprint, and rotation. Drag it with the on-canvas gizmo, press
   **R** to rotate 15°, **Ctrl/Cmd+D** to duplicate it, or **Delete** to remove it. Drag
   two pieces into each other and watch them turn red (in both 3D and the Plan tab) —
   that's live AABB collision detection, not just a visual glitch.
3. **Add something new.** Open **Add furniture** (bottom-left): search or filter by
   category, then click an item — it lands in the nearest free spot (spiral search
   outward from the room center), never on top of something else.
4. **Ask the AI assistant** (bottom-right, on by default): **Suggest a layout**
   re-arranges what's already in the room along the walls; **Cozy living room under
   $3k** runs the actual `@interior/ai` planner — a deterministic solver that turns
   constraints ("near a wall", "facing the sofa", "under budget") into validated,
   collision-checked placements. The LLM (or, here, the deterministic planner standing
   in for it) never invents coordinates; only the solver does.
5. **Switch to Plan** (toolbar, or press **2**) for the 2D floor-plan editor — reshape
   walls, add a window/door, or rotate the whole building. Press **1** to jump back to 3D.
6. **Try Realism + Capture** (toolbar): **Realism** upgrades the Kenney furniture with
   fabric/wood/plaster materials, an apartment HDRI for reflections, contact shadows,
   window daylight, and lamp glow; **Capture** renders a one-shot high-quality photo
   and pops it up full-size with a download link.
7. **Export / Import** (toolbar): download the current design as JSON, or load one back
   in — validated and schema-migrated on the way in, so an older export still opens.

## What's real vs. staged

- **Real:** the scene document (zod-validated, versioned, migrated), the 3D renderer,
  sun position (`suncalc`), AABB collision detection, patch-based undo/redo, the
  deterministic AI layout solver (`@interior/ai`), and localStorage persistence.
- **Staged for the demo:** the sample room's furniture/lighting layout is hand-tuned to
  look good immediately, and "Cozy living room under $3k" uses a small hardcoded
  price/category bridge (this catalog doesn't carry real prices) rather than a live
  storefront.
- **Known gaps** (see `README.md` "Status"): accounts, share links, and a real backend
  LLM key are Phase 5 (ship) work, not required for the core "arrange furniture with
  realistic light" loop this demo is about.

## If something looks off

- **"Something went wrong" / reading 'length'?** That was an old Realism/post-processing
  race with R3F v9 — AO passes are gone now. If you still see it from an older tab,
  click **Reset to Marina Studio** (or toolbar **Reset**) to clear a bad localStorage
  document, then hard-refresh.
- Nothing rendering? Check the browser console for a WebGL context-loss warning — the
  app recovers automatically, but a very old GPU/driver can still struggle with shadows;
  try dropping **Quality** to Low in the Lighting panel.
- AI panel missing? It's on by default; check `apps/web/.env.local` doesn't have
  `VITE_FEATURE_AI=false`.
