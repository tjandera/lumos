import OpenAI, { toFile } from 'openai';

/**
 * Photoreal re-lighting of a light-study frame.
 *
 * The input is always one of the app's *own* renders, never a text prompt alone. That
 * distinction is the whole design: the geometry, furniture placement and camera are
 * already correct and physically lit, so the model is asked only to restyle the
 * surfaces and light quality. Text-to-image would reinvent the room on every frame,
 * which is precisely what makes a "light study" worthless — you could no longer tell
 * whether a change came from the sun or from the model's imagination.
 */

/** No API key configured server-side — surface as "not set up", not a transient fault. */
export class LightStudyConfigError extends Error {}
/** The call succeeded but returned nothing usable. Never crash on this. */
export class LightStudyUpstreamError extends Error {}

/** The lighting moments worth generating. Keyed by id so the client and cache agree. */
export const LIGHT_PRESETS = {
  dawn: {
    label: 'Dawn',
    description: 'the first cool blue light before sunrise, lamps still on, long soft shadows',
  },
  morning: {
    label: 'Morning',
    description: 'bright clean morning daylight through the windows, crisp shadows, neutral white balance',
  },
  noon: {
    label: 'Midday',
    description: 'strong overhead midday sun, short hard shadows, bright and slightly cool',
  },
  golden: {
    label: 'Golden hour',
    description: 'warm low golden-hour sun raking across the room, long shadows, amber highlights',
  },
  dusk: {
    label: 'Dusk',
    description: 'deep blue twilight outside with warm interior lamps dominating the room',
  },
} as const;

export type LightPresetId = keyof typeof LIGHT_PRESETS;

export const LIGHT_PRESET_IDS = Object.keys(LIGHT_PRESETS) as LightPresetId[];

export function isLightPresetId(v: string): v is LightPresetId {
  return Object.prototype.hasOwnProperty.call(LIGHT_PRESETS, v);
}

export interface LightStudyConfig {
  apiKey: string | undefined;
  /** Image model id. Kept configurable because image-model names churn faster than
   *  chat ones and we don't want a redeploy to be a code change. */
  imageModel: string;
  /** Echo the input frame back instead of calling the image model — lets the whole
   *  round trip be exercised in tests and local dev without spending anything. */
  mock: boolean;
}

/** Strip a `data:image/...;base64,` prefix down to raw base64. */
export function decodeDataUrl(dataUrl: string): { base64: string; mime: string } {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) throw new LightStudyUpstreamError('Expected a base64 image data URL');
  return { mime: match[1]!, base64: match[2]! };
}

function buildPrompt(description: string): string {
  return [
    'Re-light this interior rendering as a photograph.',
    `Lighting: ${description}.`,
    'Keep the room exactly as it is: identical camera angle, identical wall and window positions,',
    'and every piece of furniture in the same place, at the same size, in the same orientation.',
    'Do not add, remove, or move any furniture. Do not change the room’s proportions.',
    'Only change the quality of the light and the photographic realism of the surfaces.',
  ].join(' ');
}

/**
 * Re-light one frame. Returns a PNG data URL.
 *
 * In mock mode the input frame is returned unchanged — the shape of the response is
 * what's being exercised, and an echo makes it obvious in the UI that no model ran.
 */
export async function relightFrame(
  frameDataUrl: string,
  preset: LightPresetId,
  config: LightStudyConfig,
): Promise<string> {
  const { base64, mime } = decodeDataUrl(frameDataUrl);

  if (config.mock) return `data:${mime};base64,${base64}`;
  if (!config.apiKey) throw new LightStudyConfigError('OPENAI_API_KEY is not configured on the server');

  const client = new OpenAI({ apiKey: config.apiKey });
  const spec = LIGHT_PRESETS[preset];

  let result;
  try {
    const file = await toFile(Buffer.from(base64, 'base64'), 'frame.png', { type: mime });
    result = await client.images.edit({
      model: config.imageModel,
      image: file,
      prompt: buildPrompt(spec.description),
      n: 1,
    });
  } catch (err) {
    throw new LightStudyUpstreamError(
      err instanceof Error ? `Image model call failed: ${err.message}` : 'Image model call failed',
    );
  }

  const b64 = result?.data?.[0]?.b64_json;
  if (!b64) throw new LightStudyUpstreamError('Image model returned no image');
  return `data:image/png;base64,${b64}`;
}
