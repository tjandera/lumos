import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeRoomPhoto, RoomPhotoConfigError, RoomPhotoUpstreamError } from './openai';

const createMock = vi.fn();
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: (...args: unknown[]) => createMock(...args) } };
  },
}));

const IMAGE = 'data:image/png;base64,iVBORw0KGgo=';

describe('analyzeRoomPhoto', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('returns a canned proposal in mock mode without calling the model', async () => {
    const proposal = await analyzeRoomPhoto(IMAGE, { apiKey: undefined, model: 'gpt-4o', mock: true });
    expect(proposal.roomLabel).toContain('mock');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('throws RoomPhotoConfigError when no API key is configured', async () => {
    await expect(analyzeRoomPhoto(IMAGE, { apiKey: undefined, model: 'gpt-4o', mock: false })).rejects.toBeInstanceOf(
      RoomPhotoConfigError,
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it('parses and validates a well-formed model response', async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              roomWidthMeters: 4,
              roomDepthMeters: 3,
              ceilingHeightMeters: 2.6,
              wallMaterial: { colorHex: '#ffffff', finish: 'matte' },
              floorMaterial: { colorHex: '#cccccc', finish: 'satin' },
              openings: [],
              furniture: [],
              fixtures: [],
              notes: 'ok',
            }),
          },
        },
      ],
    });
    const proposal = await analyzeRoomPhoto(IMAGE, { apiKey: 'sk-test', model: 'gpt-4o', mock: false });
    expect(proposal.roomWidthMeters).toBe(4);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('throws RoomPhotoUpstreamError when the model response is not valid JSON', async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: 'not json' } }] });
    await expect(analyzeRoomPhoto(IMAGE, { apiKey: 'sk-test', model: 'gpt-4o', mock: false })).rejects.toBeInstanceOf(
      RoomPhotoUpstreamError,
    );
  });

  it('throws RoomPhotoUpstreamError when the model response is empty', async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: null } }] });
    await expect(analyzeRoomPhoto(IMAGE, { apiKey: 'sk-test', model: 'gpt-4o', mock: false })).rejects.toBeInstanceOf(
      RoomPhotoUpstreamError,
    );
  });

  it("throws RoomPhotoUpstreamError when the model response doesn't match the schema", () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ foo: 'bar' }) } }] });
    return expect(analyzeRoomPhoto(IMAGE, { apiKey: 'sk-test', model: 'gpt-4o', mock: false })).rejects.toBeInstanceOf(
      RoomPhotoUpstreamError,
    );
  });

  it('throws RoomPhotoUpstreamError when the OpenAI call itself fails', async () => {
    createMock.mockRejectedValue(new Error('network down'));
    await expect(analyzeRoomPhoto(IMAGE, { apiKey: 'sk-test', model: 'gpt-4o', mock: false })).rejects.toBeInstanceOf(
      RoomPhotoUpstreamError,
    );
  });
});
