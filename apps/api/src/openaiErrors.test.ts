import { describe, expect, it } from 'vitest';
import { describeOpenAiError } from './openaiErrors.js';

/** The shape the OpenAI SDK throws, including its key-echoing 401 text. */
const sdkError = (status: number, code?: string, message = '') => ({
  status,
  message,
  error: { code, message },
});

// This is the real 401 body — note that OpenAI embeds a fragment of the key in it.
const REAL_401 = sdkError(
  401,
  'invalid_api_key',
  'Incorrect API key provided: sk-proj-****************G2gA. You can find your API key at ' +
    'https://platform.openai.com/account/api-keys.',
);

describe('describeOpenAiError', () => {
  it('never leaks any part of the key from a 401', () => {
    const { message } = describeOpenAiError(REAL_401);
    expect(message).not.toContain('sk-proj-');
    expect(message).not.toContain('G2gA');
    expect(message).not.toContain('*');
  });

  it('treats a rejected key as our misconfiguration, not an upstream fault', () => {
    // 503 rather than 502: nothing is wrong with OpenAI, our server is holding a dead
    // credential. Getting this backwards sends people debugging the wrong system.
    expect(describeOpenAiError(REAL_401).httpStatus).toBe(503);
  });

  it('says something the reader can actually act on', () => {
    const { message } = describeOpenAiError(REAL_401);
    expect(message).toMatch(/revoked|deleted/i);
    expect(message).toMatch(/OPENAI_API_KEY/);
  });

  it('separates "no credit" from "bad key" — they need different fixes', () => {
    const quota = describeOpenAiError(sdkError(429, 'insufficient_quota'));
    expect(quota.message).toMatch(/credit|billing/i);
    expect(quota.message).not.toMatch(/revoked/i);
  });

  it('passes a rate limit through as 429 so the client can back off', () => {
    const r = describeOpenAiError(sdkError(429, 'rate_limit_exceeded'));
    expect(r.httpStatus).toBe(429);
    expect(r.message).toMatch(/rate-limit/i);
  });

  it('reports an OpenAI outage as transient', () => {
    const r = describeOpenAiError(sdkError(503));
    expect(r.httpStatus).toBe(502);
    expect(r.message).toMatch(/transient/i);
  });

  it('flags a content-policy refusal as the photo’s problem, not the key’s', () => {
    const r = describeOpenAiError(sdkError(400, 'content_policy_violation'));
    expect(r.httpStatus).toBe(422);
    expect(r.message).toMatch(/different photo/i);
  });

  it('stays generic for an unrecognised failure rather than inventing detail', () => {
    for (const weird of [undefined, null, 'a string', new Error('boom'), {}]) {
      const r = describeOpenAiError(weird);
      expect(r.httpStatus).toBe(502);
      expect(r.message).toBe('The image model call failed.');
    }
  });

  it('does not echo an arbitrary upstream message, whatever it contains', () => {
    const nasty = sdkError(418, 'weird', 'Bearer sk-proj-SECRETSECRETSECRET leaked here');
    expect(describeOpenAiError(nasty).message).not.toContain('SECRET');
  });
});
