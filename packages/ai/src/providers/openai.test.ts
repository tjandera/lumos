import { describe, expect, it } from "vitest";
import { OpenAICompatProvider, openAICompatConfigFromEnv } from "./openai.js";
import type { ProviderEvent } from "../provider.js";

/** Build a fake streaming Response from a list of SSE data payloads. */
function sseResponse(payloads: string[]): Response {
  const body = payloads.map((p) => `data: ${p}\n\n`).join("") + "data: [DONE]\n\n";
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Split into two chunks to exercise cross-chunk buffering.
      const bytes = new TextEncoder().encode(body);
      const mid = Math.floor(bytes.length / 2);
      controller.enqueue(bytes.slice(0, mid));
      controller.enqueue(bytes.slice(mid));
      controller.close();
    }
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

async function drain(provider: OpenAICompatProvider): Promise<ProviderEvent[]> {
  const events: ProviderEvent[] = [];
  for await (const e of provider.chat({ messages: [{ role: "user", content: "hi" }] })) events.push(e);
  return events;
}

describe("OpenAICompatProvider streaming", () => {
  it("parses text deltas and assembles the final message", async () => {
    const provider = new OpenAICompatProvider({
      baseURL: "https://example.test/v1",
      model: "test-model",
      fetchImpl: async () =>
        sseResponse([
          JSON.stringify({ choices: [{ delta: { content: "Hel" } }] }),
          JSON.stringify({ choices: [{ delta: { content: "lo" } }] })
        ])
    });
    const events = await drain(provider);
    const deltas = events.filter((e) => e.type === "textDelta").map((e) => (e.type === "textDelta" ? e.text : ""));
    expect(deltas.join("")).toBe("Hello");
    const done = events.at(-1);
    expect(done?.type).toBe("done");
    if (done?.type === "done") expect(done.message.content).toBe("Hello");
  });

  it("accumulates a tool call fragmented across chunks", async () => {
    const provider = new OpenAICompatProvider({
      baseURL: "https://example.test/v1/",
      model: "test-model",
      fetchImpl: async () =>
        sseResponse([
          JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "querySpace" } }] } }] }),
          JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "{}" } }] } }] })
        ])
    });
    const events = await drain(provider);
    const toolCall = events.find((e) => e.type === "toolCall");
    expect(toolCall && toolCall.type === "toolCall" && toolCall.toolCall).toMatchObject({
      id: "call_1",
      name: "querySpace",
      arguments: "{}"
    });
  });

  it("throws with detail on a non-OK response", async () => {
    const provider = new OpenAICompatProvider({
      baseURL: "https://example.test/v1",
      model: "test-model",
      fetchImpl: async () => new Response("nope", { status: 401 })
    });
    await expect(drain(provider)).rejects.toThrow(/401/);
  });
});

describe("openAICompatConfigFromEnv", () => {
  it("reads base URL, model, and optional key", () => {
    const config = openAICompatConfigFromEnv({
      AI_PROVIDER_BASE_URL: "https://x/v1",
      AI_MODEL: "gpt-5.6",
      AI_PROVIDER_API_KEY: "secret"
    });
    expect(config).toMatchObject({ baseURL: "https://x/v1", model: "gpt-5.6", apiKey: "secret" });
  });

  it("throws when a required variable is missing", () => {
    expect(() => openAICompatConfigFromEnv({ AI_MODEL: "m" })).toThrow(/AI_PROVIDER_BASE_URL/);
    expect(() => openAICompatConfigFromEnv({ AI_PROVIDER_BASE_URL: "u" })).toThrow(/AI_MODEL/);
  });
});
