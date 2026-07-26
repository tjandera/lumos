import { afterEach, describe, expect, it, vi } from "vitest";
import type { TurnEvent } from "@interior/ai";
import { createEmptyDocument } from "@interior/core";
import { AiChatError, streamChat } from "./aiClient";

function sseBody(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    }
  });
}

interface MockResponseInit {
  ok?: boolean;
  status?: number;
  body?: ReadableStream<Uint8Array> | null;
}

function mockFetchOnce(response: MockResponseInit): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({}),
      ...response
    } as unknown as Response)
  );
}

describe("streamChat (SSE client parsing)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses a sequence of SSE-framed TurnEvents in order, including chunk-split lines", async () => {
    const events: TurnEvent[] = [
      { type: "textDelta", text: "Sure — " },
      { type: "textDelta", text: "let me help." },
      { type: "toolCallStart", toolCall: { id: "c1", name: "querySpace", arguments: "{}" } },
      { type: "toolResult", toolCallId: "c1", toolName: "querySpace", result: { ok: true } },
      { type: "done", document: createEmptyDocument(), messages: [] }
    ];
    mockFetchOnce({ body: sseBody(events) });

    const received: unknown[] = [];
    for await (const event of streamChat({ document: createEmptyDocument(), messages: [], userMessage: "hi" })) {
      received.push(event);
    }

    expect(received).toEqual(events);
  });

  it("throws AiChatError with status 404 when the server route is off", async () => {
    mockFetchOnce({ ok: false, status: 404, body: null });
    const iterator = streamChat({ document: createEmptyDocument(), messages: [], userMessage: "hi" });
    await expect(iterator.next()).rejects.toMatchObject({ name: "AiChatError", status: 404 });
  });

  it("throws AiChatError with status 429 when rate limited", async () => {
    mockFetchOnce({ ok: false, status: 429, body: null });
    const iterator = streamChat({ document: createEmptyDocument(), messages: [], userMessage: "hi" });
    await expect(iterator.next()).rejects.toMatchObject({ name: "AiChatError", status: 429 });
  });

  it("throws AiChatError when the network request itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("network error"))
    );
    const iterator = streamChat({ document: createEmptyDocument(), messages: [], userMessage: "hi" });
    await expect(iterator.next()).rejects.toBeInstanceOf(AiChatError);
  });
});
