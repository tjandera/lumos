/**
 * Turn an OpenAI SDK failure into something worth showing a user.
 *
 * Two reasons this exists rather than forwarding `err.message`:
 *
 *  - **It leaks.** OpenAI's own 401 text embeds a partially-masked key
 *    ("Incorrect API key provided: sk-proj-****…G2gA"). Passing that through to the
 *    browser puts a fragment of a server-side credential in client-visible UI, and into
 *    any error tracker or screenshot that follows.
 *  - **It doesn't help.** "Incorrect API key provided" tells the person looking at the
 *    screen — who is not the person holding the key — nothing they can act on. The
 *    status code already says exactly what went wrong; say that instead.
 */

interface StatusLike {
  status?: number;
  code?: string;
  type?: string;
}

/** Best-effort read of the SDK's structured fields without depending on its class. */
function statusOf(err: unknown): StatusLike {
  if (typeof err !== 'object' || err === null) return {};
  const e = err as Record<string, unknown>;
  const inner = (e.error ?? {}) as Record<string, unknown>;
  return {
    status: typeof e.status === 'number' ? e.status : undefined,
    code: typeof inner.code === 'string' ? inner.code : undefined,
    type: typeof inner.type === 'string' ? inner.type : undefined,
  };
}

export interface UpstreamFailure {
  /** Safe to show a user. Never contains any part of a credential. */
  message: string;
  /** What the caller should return. */
  httpStatus: number;
}

export function describeOpenAiError(err: unknown, what = 'The image model'): UpstreamFailure {
  const { status, code } = statusOf(err);

  if (status === 401 || code === 'invalid_api_key') {
    return {
      message:
        'OpenAI rejected the API key. It is well-formed but not recognised — most often ' +
        'because it was revoked or deleted. Create a fresh key and set OPENAI_API_KEY on ' +
        'the server, then restart it.',
      // 503, not 502: this is our configuration being wrong, not OpenAI misbehaving.
      httpStatus: 503,
    };
  }

  if (code === 'insufficient_quota' || status === 402) {
    return {
      message:
        'The OpenAI account has no remaining credit for this model. Add billing, or set ' +
        'IMAGE_DAY_MOCK=true to try the flow for free.',
      httpStatus: 503,
    };
  }

  if (status === 429) {
    return {
      message: 'OpenAI is rate-limiting this key. Wait a moment and try again.',
      httpStatus: 429,
    };
  }

  if (status === 400 && code === 'content_policy_violation') {
    return {
      message: `${what} declined this image under OpenAI's content policy. Try a different photo.`,
      httpStatus: 422,
    };
  }

  if (status !== undefined && status >= 500) {
    return { message: 'OpenAI had a server error. This is usually transient.', httpStatus: 502 };
  }

  // Unknown shape: say so plainly rather than inventing detail or echoing raw text.
  return { message: `${what} call failed.`, httpStatus: 502 };
}
