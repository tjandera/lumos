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

## Cost and caching

Six moments is six billed image-model calls and roughly four minutes. So:

- **One moment at a time is a first-class choice**, not a lesser one. Click a single
  moment chip to spend one image on the hour you care about.
- **Frames are cached in IndexedDB**, keyed by (photo, lat/lng, north offset, date,
  moment). Reopening the panel or reloading is free; moving the map pin or changing the
  date correctly misses. Coordinates bucket to 3dp (~100m) so map jitter doesn't re-bill.
- **The client drives the sequence**, one request per moment. A six-image batch held open
  as one request would sit far past most proxy timeouts and show nothing until the end;
  this way frames appear as they land, and one failure costs one moment rather than the run.
- Rate limited to 30 requests per 5 minutes, separate from the light study's budget so a
  timelapse can't starve single-frame re-lighting.

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
