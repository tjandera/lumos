import { describe, expect, it, vi } from "vitest";
import { OpenAIResponsesProvider } from "./openaiResponses.js";
import type { ProviderEvent, ToolDefinition } from "../provider.js";

async function drain(iterable: AsyncIterable<ProviderEvent>): Promise<ProviderEvent[]> {
  const events: ProviderEvent[] = [];
  for await (const e of iterable) events.push(e);
  return events;
}

function sseResponse(payloads: string[]): Response {
  const body = payloads.map((p) => `data: ${p}\n\n`).join("") + "data: [DONE]\n\n";
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    }
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("OpenAIResponsesProvider", () => {
  it("formats request correctly and parses stream", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({ type: "response.output_text.delta", textDelta: "hel", output_index: 0, content_index: 0 }),
        JSON.stringify({ type: "response.output_item.done", item: { type: "function_call", call_id: "call_1", name: "querySpace", arguments: "{}" } }),
        JSON.stringify({ type: "response.completed", response: { output: [{ type: "message", content: [{ type: "output_text", text: "The sofa fits." }] }] } })
      ])
    );
    const querySpaceTool: ToolDefinition = { name: "querySpace", description: "Query", parameters: {} };
    const provider = new OpenAIResponsesProvider({ apiKey: "key", model: "gpt-5.6-sol", fetchImpl });
    const events = await drain(provider.chat({ messages: [{ role: "user", content: "Find a sofa" }], tools: [querySpaceTool] }));
    
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toMatchObject({ model: "gpt-5.6-sol", stream: true, tools: [{ type: "function", name: "querySpace" }] });
    expect(events).toContainEqual({ type: "toolCall", toolCall: { id: "call_1", name: "querySpace", arguments: "{}" } });
  });

  it("assembles final text reconstruction", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({ type: "response.output_item.done", item: { type: "function_call", call_id: "call_1", name: "querySpace", arguments: "{}" } }),
        JSON.stringify({ type: "response.completed", response: { output: [{ type: "message", content: [{ type: "output_text", text: "The sofa fits." }] }] } })
      ])
    );
    const provider = new OpenAIResponsesProvider({ apiKey: "key", model: "gpt-5.6-sol", fetchImpl });
    const events = await drain(provider.chat({ messages: [{ role: "user", content: "hi" }] }));

    expect(events.at(-1)).toMatchObject({ type: "done", message: { content: "The sofa fits." } });
  });
});
