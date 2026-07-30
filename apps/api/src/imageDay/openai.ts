import OpenAI, { toFile } from 'openai';
import { describeMoment, formatClock, type DayMoment } from '@interior/core';
import { describeOpenAiError } from '../openaiErrors.js';

/**
 * "Image Generation Day" — take a photograph of a real room and show it under the light
 * it will actually get at different times of that day.
 *
 * Two stages, deliberately:
 *
 *   1. A vision pass reads the photo once and writes down what the room *is* — where the
 *      windows are, what the surfaces are made of, which lamps exist, where the camera
 *      stands. One cheap text call per run.
 *   2. Every image call then gets that description alongside the physical sun data for
 *      the moment being generated.
 *
 * Stage 1 exists because image edits drift. Ask for six hours independently and you get
 * six subtly different rooms — the rug changes colour, a window migrates. Feeding the
 * same written description into every call anchors them to one room, so the sequence
 * reads as a timelapse rather than six guesses.
 *
 * This is distinct from `../lightStudy/`, which re-lights frames the 3D renderer
 * produced. There the geometry is already correct and physically lit; here the input is
 * someone's actual photograph and the sun angles come from `dayMoments()`.
 */

export class ImageDayConfigError extends Error {}
export class ImageDayUpstreamError extends Error {
  /** What the route should return — a bad key is our 503, not OpenAI's 502. */
  constructor(message: string, readonly httpStatus = 502) {
    super(message);
  }
}

export interface ImageDayConfig {
  apiKey?: string;
  /** Vision model for stage 1. */
  visionModel: string;
  /** Image model for stage 2. Configurable because image-model names churn fast. */
  imageModel: string;
  /** Skip both calls and echo the photo back, so the flow can be exercised for free. */
  mock: boolean;
}

/** What stage 1 extracts. Free text, because that is what stage 2 consumes. */
export interface RoomLightContext {
  roomType: string;
  windows: string;
  materials: string;
  lamps: string;
  cameraView: string;
}

const FALLBACK_CONTEXT: RoomLightContext = {
  roomType: 'interior room',
  windows: 'window position as shown in the photograph',
  materials: 'surfaces and finishes exactly as shown',
  lamps: 'any lamps visible in the photograph',
  cameraView: 'the exact camera position and framing of the photograph',
};

/** Strip a `data:image/...;base64,` prefix down to raw base64. */
export function decodeDataUrl(dataUrl: string): { base64: string; mime: string } {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) throw new ImageDayUpstreamError('Expected a base64 image data URL');
  return { mime: match[1]!, base64: match[2]! };
}

const ANALYSIS_PROMPT = [
  'You are preparing notes so an image model can re-light this exact room without changing it.',
  'Describe only what you can see. Do not invent anything. Reply with JSON matching:',
  '{"roomType":"","windows":"","materials":"","lamps":"","cameraView":""}',
  '',
  '- roomType: what kind of room this is, in a few words.',
  '- windows: every window and glazed door — which wall, roughly how large, how much of the',
  '  frame they occupy, and anything covering them (curtains, blinds). This is the single',
  '  most important field: it is where the daylight will come from.',
  '- materials: floor, walls, ceiling and the main furniture, with colours and finishes.',
  '- lamps: every light fitting you can see, and where it is. Say "none visible" if so.',
  '- cameraView: where the camera is and what it faces, so the framing can be preserved.',
].join('\n');

/**
 * Stage 1: read the room once.
 *
 * A failure here is not fatal. A generic fallback description still produces usable
 * images — the sun data in stage 2 is doing the heavy lifting — so a flaky vision call
 * degrades the result rather than failing the user's whole run.
 */
export async function analyzeRoom(
  imageDataUrl: string,
  config: ImageDayConfig,
): Promise<RoomLightContext> {
  if (config.mock) return { ...FALLBACK_CONTEXT, roomType: 'mock room' };
  if (!config.apiKey) throw new ImageDayConfigError('OPENAI_API_KEY is not configured on the server');

  const client = new OpenAI({ apiKey: config.apiKey });
  try {
    const completion = await client.chat.completions.create({
      model: config.visionModel,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: ANALYSIS_PROMPT },
            { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
          ],
        },
      ],
    });
    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) return FALLBACK_CONTEXT;
    const parsed = JSON.parse(raw) as Partial<RoomLightContext>;
    // Merge field by field: a model that returns four of five useful fields should not
    // cost us the four.
    return {
      roomType: parsed.roomType?.trim() || FALLBACK_CONTEXT.roomType,
      windows: parsed.windows?.trim() || FALLBACK_CONTEXT.windows,
      materials: parsed.materials?.trim() || FALLBACK_CONTEXT.materials,
      lamps: parsed.lamps?.trim() || FALLBACK_CONTEXT.lamps,
      cameraView: parsed.cameraView?.trim() || FALLBACK_CONTEXT.cameraView,
    };
  } catch {
    return FALLBACK_CONTEXT;
  }
}

/**
 * The image prompt for one moment.
 *
 * Structured as: what the room is → what the sun is doing → what must not change. The
 * last part is load-bearing and unusually blunt, because an image model handed a room
 * and the word "evening" will cheerfully redecorate it.
 */
export function buildImagePrompt(
  moment: DayMoment,
  context: RoomLightContext,
  opts: { dateLabel?: string; polar?: 'polarDay' | 'polarNight' } = {},
): string {
  const when = `${moment.label}, ${formatClock(moment.minutes)} local solar time`;
  const season = opts.dateLabel ? ` on ${opts.dateLabel}` : '';

  const lines = [
    `Photograph this exact ${context.roomType} at ${when}${season}.`,
    '',
    'THE ROOM (must stay exactly as described — this is a real room, not a new one):',
    `- Windows: ${context.windows}`,
    `- Surfaces and furniture: ${context.materials}`,
    `- Lamps: ${context.lamps}`,
    `- Camera: ${context.cameraView}`,
    '',
    'THE LIGHT (this is the only thing that changes):',
    `- ${describeMoment(moment)}`,
  ];

  if (moment.bearingDeg !== null) {
    lines.push(
      `- Sun altitude ${Math.round(moment.altitudeDeg)}°, bearing ${Math.round(moment.bearingDeg)}° ` +
        'relative to the room. Daylight must enter only through the windows described above, ' +
        'and only from that direction — if the sun is behind a wall, that wall’s windows get ' +
        'indirect skylight, not a sunbeam.',
    );
  } else {
    lines.push(
      '- The sun is below the horizon. No sunbeams, no cast sun patches. Only dim skylight ' +
        'through the windows plus whatever lamps the room has.',
    );
  }

  if (opts.polar === 'polarDay') {
    lines.push('- This latitude has midnight sun on this date: the sun is up around the clock.');
  } else if (opts.polar === 'polarNight') {
    lines.push('- This latitude has polar night on this date: the sun does not rise at all.');
  }

  lines.push(
    '',
    'DO NOT CHANGE ANYTHING ELSE:',
    '- Identical camera position, angle, focal length and framing.',
    '- Every wall, window, door and piece of furniture in the same place, at the same size,',
    '  in the same orientation, in the same colours and materials.',
    '- Do not add, remove, move, restyle or reupholster anything. Do not redecorate.',
    '- Do not add people, pets, plants or clutter that is not already there.',
    '',
    'Photorealistic interior photograph, natural exposure for the stated light, no text or watermarks.',
  );

  return lines.join('\n');
}

/**
 * Stage 2: generate one moment. Returns a PNG data URL.
 *
 * `images.edit` rather than a text-to-image call, so the model is transforming the user's
 * actual photograph instead of inventing a room from the description.
 */
export async function generateMoment(
  imageDataUrl: string,
  moment: DayMoment,
  context: RoomLightContext,
  config: ImageDayConfig,
  opts: { dateLabel?: string; polar?: 'polarDay' | 'polarNight' } = {},
): Promise<string> {
  const { base64, mime } = decodeDataUrl(imageDataUrl);

  // Echo the source back so the UI flow is exercised end to end and it stays obvious
  // that no model ran.
  if (config.mock) return `data:${mime};base64,${base64}`;
  if (!config.apiKey) throw new ImageDayConfigError('OPENAI_API_KEY is not configured on the server');

  const client = new OpenAI({ apiKey: config.apiKey });
  let result;
  try {
    const file = await toFile(Buffer.from(base64, 'base64'), 'room.png', { type: mime });
    result = await client.images.edit({
      model: config.imageModel,
      image: file,
      prompt: buildImagePrompt(moment, context, opts),
      n: 1,
    });
  } catch (err) {
    // Never forward OpenAI's own text: its 401 embeds a partially-masked key.
    const { message, httpStatus } = describeOpenAiError(err);
    throw new ImageDayUpstreamError(message, httpStatus);
  }

  const b64 = result?.data?.[0]?.b64_json;
  if (!b64) throw new ImageDayUpstreamError('Image model returned no image');
  return `data:image/png;base64,${b64}`;
}
