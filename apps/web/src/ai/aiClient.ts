/**
 * SSE client for `POST /ai/chat`. Reuses `iterateSSE` from `@interior/ai`
 * (the same line-framing the `OpenAICompatProvider` uses server-side) so the
 * browser and the API agree on wire format without duplicating the parser.
 *
 * Yields `TurnEvent`s (plus a synthetic `error` event for mid-stream
 * provider failures the server reports inline) as they arrive. Throws
 * `AiChatError` for failures that happen before any streaming starts —
 * network down, `FEATURE_AI` off (404), rate limited (429), bad request.
 */

import { iterateSSE, type ChatMessage, type TurnEvent } from "@interior/ai";
import type { SceneDocument } from "@interior/core";

const BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export interface StreamChatInput {
  document: SceneDocument;
  /** Prior conversation history (assistant/user/tool messages), no system message. */
  messages: ChatMessage[];
  userMessage: string;
  roomId?: string;
  signal?: AbortSignal;
}

/** A mid-stream failure the server reports inline (provider error after headers were sent). */
export type StreamErrorEvent = { type: "error"; message: string };
export type ClientTurnEvent = TurnEvent | StreamErrorEvent;

export class AiChatError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "AiChatError";
  }
}

export interface AiStatus {
  enabled: boolean;
  provider: "mock" | "llm" | null;
}

/**
 * `GET /ai/status` — lets the web app tell "assistant off", "assistant on
 * with the offline mock" and "assistant on with a real LLM" apart without
 * probing `/ai/chat` itself. Best-effort: any failure (API down, CORS,
 * older API build without the route) is treated as "unknown" (`null`)
 * rather than thrown, since this only drives an informational note in the
 * chat empty-state, never a hard error.
 */
export async function fetchAiStatus(signal?: AbortSignal): Promise<AiStatus | null> {
  try {
    const response = await fetch(`${BASE_URL}/ai/status`, signal ? { signal } : undefined);
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!body || typeof body !== "object") return null;
    const { enabled, provider } = body as { enabled?: unknown; provider?: unknown };
    if (typeof enabled !== "boolean") return null;
    if (provider !== "mock" && provider !== "llm" && provider !== null) return null;
    return { enabled, provider };
  } catch {
    return null;
  }
}

export async function* streamChat(input: StreamChatInput): AsyncGenerator<ClientTurnEvent> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/ai/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        document: input.document,
        messages: input.messages,
        userMessage: input.userMessage,
        ...(input.roomId ? { roomId: input.roomId } : {})
      }),
      ...(input.signal ? { signal: input.signal } : {})
    });
  } catch {
    throw new AiChatError("Couldn't reach the AI service — is the API running?");
  }

  if (response.status === 404) {
    throw new AiChatError("The AI assistant is turned off on the server (FEATURE_AI is not enabled).", 404);
  }
  if (response.status === 429) {
    throw new AiChatError("Too many AI requests — please wait a moment and try again.", 429);
  }
  if (!response.ok || !response.body) {
    const detail = await safeErrorDetail(response);
    throw new AiChatError(detail || `AI request failed (${response.status})`, response.status);
  }

  for await (const data of iterateSSE(response.body)) {
    if (!data) continue;
    let event: ClientTurnEvent;
    try {
      event = JSON.parse(data) as ClientTurnEvent;
    } catch {
      continue; // ignore malformed/keep-alive lines
    }
    yield event;
  }
}

async function safeErrorDetail(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.message === "string") return body.message;
    if (typeof body?.error === "string") return body.error;
  } catch {
    // not JSON / empty body
  }
  return "";
}
