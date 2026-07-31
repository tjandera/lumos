# Image Generation Day

Upload a photo of a real room; see that room under the daylight it actually gets across a
day.

**This is not the Day light study.** That one re-lights frames our own 3D renderer
produced, where the geometry is already correct and physically lit. This one starts from
somebody's photograph, so the room has to be read first and then preserved through every
generated hour. Different input, different failure modes, separate feature.

## The pipeline

```
photo ──► POST /image-day/analyze ──► RoomLightContext   (one vision call per run)
                                          │
      dayMoments(lat, lng, date, north) ──┤              (no model, no cost)
                                          ▼
        for each moment: POST /image-day/generate ──► images.edit ──► PNG
                                          │
                                          ▼
                                   IndexedDB cache
```

**Stage 1 — read the room once.** A vision pass writes down what the room *is*: where the
windows are, what the surfaces are made of, which lamps exist, where the camera stands.

That stage exists because image edits drift. Ask for six hours independently and you get
six subtly different rooms — the rug changes colour, a window migrates. Feeding the same
written description into every call anchors them to one room, so the sequence reads as a
timelapse rather than six guesses. It's one cheap text call per run, not per image, and a
failure here is non-fatal: a generic description still produces usable images.

**Stage 2 — generate each moment.** `images.edit`, not text-to-image, so the model
transforms the user's actual photograph rather than inventing a room from the description.

## The sun is real

Times and angles come from `dayMoments()` in `@interior/core`, anchored to genuine
sunrise / solar noon / sunset for the design's location, orientation and date. Golden hour
is that building's golden hour: 17:28 in Singapore in July, 15:08 in London in December.

Prompts say what the sun is physically doing — `Sun altitude 62°, bearing 180° relative to
the room` — because that is what an image model can act on. "Golden hour" alone gets you a
stock filter.

Clock times are **local solar time** (longitude ÷ 15), not the machine's timezone and not
a tz database. Using `getHours()` on a server in another timezone reorders the entire day;
solar time is timezone-free, dependency-free, and lands within about half an hour of civil
time. See the note in `packages/core/src/dayMoments.ts`.

Inside the polar circles there may be no sunrise at all. Those days are detected
(`kind: 'polarDay' | 'polarNight'`), spread across 24 hours instead, and the prompt says
so rather than quietly inventing a sunrise.

## The twelve moments

A full 24-hour cycle, anchored to genuine solar events rather than fixed hours:

| | | |
| --- | --- | --- |
| `night` (solar midnight) | `preDawn` | `dawn` |
| `sunrise` | `earlyMorning` | `lateMorning` |
| `midday` (solar noon) | `earlyAfternoon` | `lateAfternoon` |
| `goldenHour` | `sunset` | `dusk` |

Twelve rather than a tidier six because the interesting transitions cluster at the ends:
sunrise, golden hour, sunset and dusk all happen within a couple of hours of each other
and look nothing alike, while the middle of the day changes slowly.

Each carries a `phase` — `night`, `morningTwilight`, `day`, `eveningTwilight` — kept
separate from altitude because "just below the horizon" and "the middle of the night" are
both dark but want completely different images: one is a pale blue-grey sky with lamps
starting to matter, the other is lamps and nothing else.

**The horizon is at -0.833°, not 0.** Refraction lifts the disc by ~0.57° and its own
radius adds ~0.27°, which is why almanacs put sunrise there. Using plain `altitude <= 0`
marked the exact moment of sunrise as "after dark" — telling the image model there was no
sun at the moment the sun is sitting on the horizon, which is the most dramatic light of
the day.

## Download

**Download all (n)** builds a ZIP client-side and includes a `README.txt` manifest —
date, location, room rotation, sunrise/sunset, model used, and a table of every image with
its time and the sun's altitude and bearing. A folder of a dozen room photos is
meaningless without knowing which hour each one is; that context is the point of the
feature and would otherwise be lost the moment the files leave the app.

Files are numbered `01-night.png` … `12-dusk.png` so a plain alphabetical listing is still
in time order. Whatever has been generated is exported — a partial day is still worth
keeping, and was still paid for.

No zip dependency: every entry is a PNG, already DEFLATE-compressed internally, so
re-deflating would cost CPU and typically *grow* the output. `STORE` is correct here and
reduces the format to headers plus raw bytes (`zip.ts`, ~100 lines, tested against the
byte layout).

## Quick 6 vs Full 12

The panel defaults to **Quick 6** — half the money and half the wait, still a whole cycle:

| | |
| --- | --- |
| `night` | lamps only, no sun at all |
| `sunrise` | low sun raking in from one side |
| `midday` | high sun, short shadows |
| `lateAfternoon` | low sun raking in from the *other* side |
| `goldenHour` | warm, near-horizontal |
| `dusk` | blue ambient, lamps taking over |

Chosen for how light *enters a room*, not for even spacing. Morning and afternoon low sun
are both kept deliberately: in a real room they hit different walls, which is exactly what
someone deciding where to put a sofa needs to see. Morning twilight is the one that gets
cut — `night` already covers "dark room, lamps on", and a second near-identical dark frame
is a poor use of one of only six images.

**Full 12** is one click away for the complete cycle. The set lives in
`ESSENTIAL_MOMENT_IDS` in `@interior/core` so the API and the client can't disagree
about it.

## Running them in parallel

Generation is ~30s of *waiting*, not of local work, so a run spends nearly all its time
idle. `runPool` keeps **4 in flight**:

| | Sequential | 4 at a time |
| --- | --- | --- |
| Quick 6 | ~3 min | ~50s |
| Full 12 | ~6 min | ~1.5 min |

Identical cost — same number of billed calls, only the wall clock changes.

Four rather than all twelve, for three reasons: browsers cap concurrent connections per
origin at six on HTTP/1.1, so beyond that requests queue invisibly in the network stack
where nothing can cancel them; image APIs rate-limit hard enough that a full fan-out
mostly buys 429s; and a smaller pool keeps the retry path quiet.

The pool retries 429s and genuine upstream 5xx with exponential backoff, but **not 503** —
our API uses that specifically for "the key is bad" or "the account has no credit", and
neither improves by asking again. Retrying those would be three wasted round trips per
image, twelve times over.

Frames arrive out of order once several are in flight, so the panel re-sorts into schedule
order on every arrival rather than appending. One failed hour is reported after the run
instead of aborting it — the hours that succeeded were still paid for.

## Cost and caching

Twelve moments is twelve billed image-model calls — roughly ninety seconds on
`gpt-image-2` at four-way concurrency. So:

- **One moment at a time is a first-class choice**, not a lesser one. Click a single
  moment chip to spend one image on the hour you care about.
- **Frames are cached in IndexedDB**, keyed by (photo, lat/lng, north offset, date,
  moment). Reopening the panel or reloading is free; moving the map pin or changing the
  date correctly misses. Coordinates bucket to 3dp (~100m) so map jitter doesn't re-bill.
- **The client drives the sequence**, one request per moment. A six-image batch held open
  as one request would sit far past most proxy timeouts and show nothing until the end;
  this way frames appear as they land, and one failure costs one moment rather than the run.
- Rate limited to 30 requests per 5 minutes, separate from the light study's budget so a
  timelapse can't starve single-frame re-lighting — comfortably above a 12-image run plus
  its analyse call.

## Configuration

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Required for real generation. |
| `OPENAI_MODEL` | Vision model for stage 1. Default `gpt-5.6`. |
| `OPENAI_IMAGE_MODEL` | Image model for stage 2. Default `gpt-image-1` (the widely-available one). Set `gpt-image-2` if your account has it — measured ~3x faster (31s vs 92s per image) and noticeably more faithful to the input: given the same prompt, `gpt-image-1` invented a window frame that wasn't in the source, `gpt-image-2` didn't. Fidelity to the user's actual room is the whole point here, so prefer it. |
| `IMAGE_DAY_MOCK=true` | Echo the photo back instead of calling either model — exercises the whole flow for free. |

## Gotchas

**`.env` is read once, at startup.** `index.ts` calls `process.loadEnvFile` when the
process boots, and `tsx watch` only restarts on *source* changes — so editing `.env` does
nothing until you actually restart the API. A stale process holding a revoked key produces
exactly the same error as a genuinely bad key. If a key change appears to have no effect,
check the process is younger than the file:

```bash
stat -f '%Sm' apps/api/.env          # when the key was saved
ps -o lstart= -p $(lsof -ti:8787)    # when the server started
```

**Only one `OPENAI_API_KEY=` line.** Appending with `>>` leaves duplicates; the last one
silently wins, which makes for a confusing debug session. Replace the line rather than
appending.

## Privacy

The uploaded photo goes to the image model, and that's it. It is not written into the
scene document, not persisted server-side, and not included in share links. The panel says
so before you upload. The cache is local to the browser.
