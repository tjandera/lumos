# Lumos in plain language

## The one-sentence version

You draw your room, drop your building on a map, put furniture in it, and drag a
time-of-day slider to watch the real sun move through the real windows, so you can tell
whether that sofa will sit in a sunbeam at 3pm before you pay for it.

## The problem, in one paragraph

Furniture shopping is guesswork twice over. You cannot tell if it fits, and you cannot
tell what it will look like in your light. Catalog photos are shot in someone else's room
under studio lighting. You find out the truth on delivery day, when the sofa blocks the
hallway and the reading chair turns out to sit in shade all afternoon. Returning a sofa
is expensive and annoying, so most people just live with the mistake.

## What the app actually does, step by step

1. **Draw the room, or import it.** A 2D floor plan with real wall thickness, windows and
   doors. It turns into a 3D room with actual holes where the windows are.
2. **Say where it is.** Find your building on a satellite map, drop a pin, and rotate the
   room until it faces the direction it really faces. This is the step that makes
   everything else true instead of decorative.
3. **Put furniture in.** Pick from a catalog of 35 pieces at real-world sizes. Drag them
   around. If two things overlap, both turn red immediately, in the plan and in 3D.
4. **Move time.** Drag the time slider and the sunlight moves with it, entering through
   the real windows at the real angles for your address and today's date. Early morning
   light comes in low and long. Midday light is short and overhead.
5. **Check it properly.** Turn on the brightness heatmap to see whether the room actually
   meets the lighting standard for a living room or a desk. Or render the whole day, one
   frame an hour, and scrub through it like a video.
6. **Ask for help.** The assistant can arrange the room for you, or fill an empty room to
   a budget.
7. **Keep it.** Export it as a file, save it to an account, or share a read-only link.

## Why the light is the interesting part

Most 3D room tools give you a lighting *mood*: a "warm evening" preset, a "bright" slider.
It looks nice and tells you nothing.

Here the light is computed. Give it a latitude, a longitude, a date and a compass
direction, and there is exactly one correct answer for where the sun is at 3pm. The app
computes that answer and puts the sun there. That means the shadows on your floor are
predictions you can check against reality by standing in the room.

The honesty test we held ourselves to: a room with no windows and no lamps renders
completely dark, because that is what a room with no windows and no lamps looks like. A
lot of tools quietly add invisible fill light so everything always looks presentable. We
do not, because the whole point is to tell you the truth about your room.

---

# The technical side, explained simply

## The one idea everything hangs off

There is a single file format, a plain JSON object called a `SceneDocument`. It describes
the room: walls, windows, doors, furniture, lights, where the building is, which way it
faces. Measurements are in meters, angles in degrees.

**Every part of the app only reads and writes that one object.** The 3D view draws it. The
AI proposes changes to it. The server stores it. Nothing else is shared.

Why this matters: it means the 3D renderer, the AI and the database do not know about each
other. You can rewrite any one of them without touching the other two. It also means the
tricky logic (does this fit, where is the sun, is this bright enough) is plain arithmetic
that can be tested without ever opening a browser or starting a graphics card. That is why
there are 788 passing tests.

## How saved designs survive changes

The document carries a version number, currently 7. Every time the format changes, the
number goes up and a small migration function is written that upgrades an old document to
the new shape. When you open a design saved months ago, it walks through those migrations
on the way in.

The rule is simple: a design you saved must never stop opening.

## How undo works

Instead of taking a full snapshot of the room after every change, the app records the
small patch describing what changed. Undo applies the patch backwards.

The useful part is grouping. When the AI moves eight pieces of furniture at once, that is
recorded as one patch, so one press of undo puts all eight back. You are undoing an action
as you understood it, not eight separate mutations.

## How the lighting works

Two layers:

- **The sun.** A library called `suncalc` gives the sun's angle and height for any
  location, date and time. Combine that with which way the building faces and you have the
  direction sunlight enters. The 3D engine casts shadows from a light in exactly that
  direction.
- **Everything else.** Bounced and ambient light comes from an environment image (a
  photographed 360 degree panorama of an apartment), which is much cheaper than simulating
  bounced light properly and looks far better than a flat grey fill.

We deliberately did not pre-compute ("bake") the lighting. Baked lighting is faster and
prettier, but it is calculated for one fixed arrangement, so it becomes wrong the instant
you move a chair. Since moving furniture is the entire point, real-time it is.

## How the AI is kept from lying

This is the part we are most deliberate about.

Language models are bad at spatial arithmetic. Ask one for coordinates and it will
confidently place a sofa half inside a wall. So the model is never allowed to produce
coordinates.

Instead it produces *intent*: "a two-seat sofa against the long wall, facing the window,
with a coffee table in front of it." Ordinary, deterministic, testable code then turns that
intent into actual positions, checks every footprint against every other footprint and
against the walls, and rejects or repairs anything that collides or leaves too little
walking room.

The result is that the AI can be creative and slightly wrong, and the output is still
guaranteed to be a physically valid room. If the model is unavailable, a built-in fallback
does the same job, so no button is ever a dead end.

## How photos fit in

Two features work from a real photograph rather than a 3D model.

- **Room import** reads a photo of a room and proposes its dimensions, windows and doors.
  That proposal is checked against the schema before anything is created, so a bad reading
  fails loudly instead of producing a broken room.
- **Image Generation Day** takes a photo of your actual room and regenerates it at twelve
  moments across the day, using the real sun angles for your address. It reads the room
  once first so the furniture and windows stay consistent from hour to hour, and it edits
  your photo rather than inventing a new room.

Both cost money per call, so both have a free mock mode that exercises the entire flow
without contacting anything.

## How it is built and shipped

- A pnpm monorepo: four shared libraries (`core`, `renderer`, `catalog`, `ai`) and two
  applications (`web`, `api`).
- Front end: React 19, three.js through React Three Fiber, Tailwind, Zustand for state.
- Back end: Fastify on Node 22, storing designs either as JSON files (zero setup) or in
  Postgres (set one environment variable). Both are tested against the same shared
  contract suite, so they cannot drift apart.
- Deployment: one command with Docker Compose, or Kubernetes manifests with health probes,
  autoscaling and non-root containers.

## The performance trick worth knowing

The 3D view does not redraw continuously. It sits idle until something actually changes.
A still room costs nothing, which is the difference between a quiet laptop and a loud one.
On top of that, the app measures its own frame rate and adjusts quality up as well as down,
so a fast machine gets a better picture instead of being capped at the lowest common
setting.

## What is honestly not finished

`pnpm test` currently fails. 25 tests across 8 front-end suites are red because a refactor
moved some modules and their tests have not been updated. The features work in the running
app; the tests point at the old locations. Everything else, 788 tests, passes.

There is also no password reset, because no email service is connected.
