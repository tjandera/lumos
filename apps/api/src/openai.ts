import OpenAI from 'openai';
import { RoomPhotoProposalSchema, type RoomPhotoProposal } from '@interior/core';

/** No API key configured server-side — the caller should surface this as "not set up
 * yet", not a transient failure. */
export class RoomPhotoConfigError extends Error {}
/** The model call succeeded but the response was unusable (empty, not JSON, or didn't
 * match RoomPhotoProposalSchema) — never crash on this, just report it clearly. */
export class RoomPhotoUpstreamError extends Error {}

const PROMPT = `You are analyzing a single photo of a room to help build an approximate 3D model of it for testing natural and artificial lighting. You are NOT measuring the room precisely — you are making an experienced, reasonable estimate a person will sanity-check and adjust by hand afterward. Prefer common, ordinary values when uncertain (most living rooms are roughly 3-6 meters per side; ceilings are usually 2.4-3m) rather than extreme guesses.

To estimate scale, anchor off a known reference object rather than guessing distances cold: a standard door is about 2.0-2.05m tall and 0.8-0.9m wide, a standard window sill sits around 0.8-0.9m up, an average dining chair seat is about 0.45m off the floor, and a light switch or power outlet sits roughly 1.1m / 0.3m up respectively. If one of these is visible, use it to calibrate everything else in the shot (room width, furniture size, ceiling height) instead of estimating each in isolation. Use converging perspective lines (where the floor meets the walls, the ceiling line, the far corner) to judge the room's proportions, not just what looks "about right" in isolation.

Look carefully before answering: count actual distinct pieces of furniture and fixtures rather than a rough impression, note which wall each window/door is actually on relative to the others, and describe wall/floor color as what's actually in the photo (including any strong color cast from the room's own lighting) rather than a generic default.

Respond with ONLY a single JSON object (no prose, no markdown fences) with exactly this shape:

{
  "roomLabel": string (short, e.g. "Living Room", "Bedroom" — omit if unclear),
  "roomWidthMeters": number (1.5-15),
  "roomDepthMeters": number (1.5-15),
  "ceilingHeightMeters": number (2.0-4.5),
  "wallMaterial": { "colorHex": "#rrggbb", "finish": "matte" | "eggshell" | "satin" | "gloss" },
  "floorMaterial": { "colorHex": "#rrggbb", "finish": "matte" | "eggshell" | "satin" | "gloss" },
  "openings": [
    {
      "kind": "window" | "door",
      "wall": "N" | "S" | "E" | "W",
      "positionAlongWall": number (0-1),
      "widthMeters": number,
      "heightMeters": number,
      "sillHeightMeters": number (0 for doors)
    }
  ],
  "furniture": [
    {
      "category": "sofa" | "armchair" | "bench" | "chair" | "coffee_table" | "dining_table" | "side_table" | "desk" | "bed" | "bookshelf" | "tv_stand" | "plant" | "rug" | "other",
      "nx": number (0-1, position across the room's width),
      "nz": number (0-1, position across the room's depth),
      "rotationDeg": number (0-360, which way it faces),
      "confidence": number (0-1)
    }
  ],
  "fixtures": [
    {
      "kind": "ceiling" | "wall" | "floor" | "table",
      "nx": number (0-1),
      "nz": number (0-1),
      "kelvin": number (2700-6500, warm-to-cool guess),
      "on": boolean
    }
  ],
  "notes": string (brief caveats, e.g. "window direction on the shadow side is a guess")
}

Notes on the wall labels N/S/E/W: these are just four consistent local labels for the room's four walls as if viewed from directly above (clockwise) — they do NOT need to match true compass directions. A person sets the room's real-world orientation separately afterward.

Any furniture-shaped object that is itself a light source (floor lamp, table lamp) belongs under "fixtures" (kind "floor" or "table"), not "furniture". Only include furniture/fixtures you can actually see — it's fine for those arrays to be short or empty. If a door is visible, include it as an opening with kind "door". If nothing matches a furniture category well, use "other" rather than forcing a wrong-looking guess — a piece you're unsure about is better skipped than misidentified.`;

function mockProposal(): RoomPhotoProposal {
  return RoomPhotoProposalSchema.parse({
    roomLabel: 'Living Room (mock)',
    roomWidthMeters: 4.6,
    roomDepthMeters: 3.8,
    ceilingHeightMeters: 2.7,
    wallMaterial: { colorHex: '#e9e3d6', finish: 'matte' },
    floorMaterial: { colorHex: '#b98f63', finish: 'satin' },
    openings: [
      { kind: 'window', wall: 'S', positionAlongWall: 0.35, widthMeters: 1.6, heightMeters: 1.3, sillHeightMeters: 0.85 },
      { kind: 'door', wall: 'W', positionAlongWall: 0.1, widthMeters: 0.9, heightMeters: 2.05, sillHeightMeters: 0 },
    ],
    furniture: [
      { category: 'sofa', nx: 0.55, nz: 0.18, rotationDeg: 180, confidence: 0.9 },
      { category: 'coffee_table', nx: 0.55, nz: 0.4, rotationDeg: 0, confidence: 0.85 },
      { category: 'tv_stand', nx: 0.55, nz: 0.92, rotationDeg: 0, confidence: 0.7 },
      { category: 'rug', nx: 0.55, nz: 0.45, rotationDeg: 0, confidence: 0.6 },
    ],
    fixtures: [{ kind: 'ceiling', nx: 0.5, nz: 0.5, kelvin: 2700, on: true }],
    notes: 'Mock response — ROOM_PHOTO_MOCK is set, OpenAI was not called.',
  });
}

export interface AnalyzeRoomPhotoDeps {
  apiKey: string | undefined;
  model: string;
  mock: boolean;
}

/** Calls the vision model on one room photo and returns a validated RoomPhotoProposal.
 * Never returns anything that hasn't passed RoomPhotoProposalSchema — a model response
 * that doesn't fit throws RoomPhotoUpstreamError rather than propagating raw, untrusted
 * data any further. */
export async function analyzeRoomPhoto(imageDataUrl: string, deps: AnalyzeRoomPhotoDeps): Promise<RoomPhotoProposal> {
  if (deps.mock) return mockProposal();
  if (!deps.apiKey) throw new RoomPhotoConfigError('OPENAI_API_KEY is not configured on the server');

  const client = new OpenAI({ apiKey: deps.apiKey });
  let content: string | null | undefined;
  try {
    const completion = await client.chat.completions.create({
      model: deps.model,
      response_format: { type: 'json_object' },
      max_tokens: 2200,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            // 'high' detail spends more tokens per image but matters a lot here — the
            // model needs to actually make out proportions, wall lines, and small
            // furniture, not just get the gist of the room.
            { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
          ],
        },
      ],
    });
    content = completion.choices[0]?.message?.content;
  } catch (err) {
    throw new RoomPhotoUpstreamError(`The vision model request failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!content) throw new RoomPhotoUpstreamError('The model returned an empty response');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new RoomPhotoUpstreamError("The model's response was not valid JSON");
  }

  const result = RoomPhotoProposalSchema.safeParse(parsed);
  if (!result.success) {
    throw new RoomPhotoUpstreamError(`The model's response didn't match the expected shape: ${result.error.message}`);
  }
  return result.data;
}
