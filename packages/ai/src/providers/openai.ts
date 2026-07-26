/**
 * OpenAI-compatible chat provider (Chat Completions wire format, streaming).
 *
 * Works against any endpoint speaking the OpenAI `/chat/completions` protocol
 * (OpenAI, Azure, vLLM, LiteLLM, Ollama's OpenAI shim, the plan's "GPT-5.6"
 * placeholder, …). The model name and base URL are ALWAYS config — nothing is
 * hardcoded. `fetch` is injectable so it can be tested without a network.
 *
 * Streaming: SSE `data:` lines carry `chat.completion.chunk` objects. Text
 * arrives as `choices[0].delta.content`; tool calls arrive fragmented across
 * chunks (`delta.tool_calls[].function.{name,arguments}`) keyed by `index`, so
 * we accumulate them and emit a single `toolCall` per index at the end.
 */

import type {
  ChatMessage,
  ChatProvider,
  ChatRequest,
  ProviderEvent,
  ToolCall,
  ToolDefinition
} from "../provider.js";

export interface OpenAICompatConfig {
  /** Base URL, e.g. "https://api.openai.com/v1" (no trailing slash required). */
  baseURL: string;
  /** Model name — the plan's placeholder is configuration, not a constant. */
  model: string;
  /** API key sent as a Bearer token (optional for keyless local servers). */
  apiKey?: string;
  /** Extra headers to merge into every request. */
  headers?: Record<string, string>;
  /** Injectable fetch (defaults to the global). */
  fetchImpl?: typeof fetch;
  /** Path appended to `baseURL`; defaults to "/chat/completions". */
  chatPath?: string;
}

/**
 * Build an `OpenAICompatConfig` from environment variables:
 *   - `AI_PROVIDER_BASE_URL` (required)
 *   - `AI_MODEL`             (required)
 *   - `AI_PROVIDER_API_KEY`  (optional)
 * Throws if a required variable is missing.
 */
export function openAICompatConfigFromEnv(env: Record<string, string | undefined> = process.env): OpenAICompatConfig {
  const baseURL = env.AI_PROVIDER_BASE_URL;
  const model = env.AI_MODEL;
  if (!baseURL) throw new Error("AI_PROVIDER_BASE_URL is not set");
  if (!model) throw new Error("AI_MODEL is not set");
  const config: OpenAICompatConfig = { baseURL, model };
  if (env.AI_PROVIDER_API_KEY) config.apiKey = env.AI_PROVIDER_API_KEY;
  return config;
}

interface AccumulatingToolCall {
  id: string;
  name: string;
  arguments: string;
}

export class OpenAICompatProvider implements ChatProvider {
  readonly model: string;
  private readonly config: OpenAICompatConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OpenAICompatConfig) {
    this.config = config;
    this.model = config.model;
    const impl = config.fetchImpl ?? globalThis.fetch;
    if (!impl) throw new Error("No fetch implementation available; pass config.fetchImpl");
    this.fetchImpl = impl;
  }

  async *chat(request: ChatRequest): AsyncIterable<ProviderEvent> {
    const url = `${this.config.baseURL.replace(/\/$/, "")}${this.config.chatPath ?? "/chat/completions"}`;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
      ...this.config.headers
    };

    const body = JSON.stringify({
      model: this.config.model,
      stream: true,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      messages: request.messages.map(toWireMessage),
      ...(request.tools && request.tools.length > 0 ? { tools: request.tools.map(toWireTool) } : {})
    });

    const response = await this.fetchImpl(url, { method: "POST", headers, body, signal: request.signal });
    if (!response.ok || !response.body) {
      const detail = await safeText(response);
      throw new Error(`Chat request failed (${response.status}): ${detail}`);
    }

    const textParts: string[] = [];
    const toolCalls = new Map<number, AccumulatingToolCall>();

    for await (const data of iterateSSE(response.body)) {
      if (data === "[DONE]") break;
      let chunk: WireChunk;
      try {
        chunk = JSON.parse(data) as WireChunk;
      } catch {
        continue; // ignore keep-alives / malformed lines
      }
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      if (typeof delta.content === "string" && delta.content.length > 0) {
        textParts.push(delta.content);
        yield { type: "textDelta", text: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const index = tc.index ?? 0;
          const acc = toolCalls.get(index) ?? { id: "", name: "", arguments: "" };
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name += tc.function.name;
          if (tc.function?.arguments) acc.arguments += tc.function.arguments;
          toolCalls.set(index, acc);
        }
      }
    }

    const finalToolCalls: ToolCall[] = [...toolCalls.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, tc]) => ({
        id: tc.id || `tool-${index}`,
        name: tc.name,
        arguments: tc.arguments
      }))
      .filter((tc) => tc.name.length > 0);

    for (const toolCall of finalToolCalls) {
      yield { type: "toolCall", toolCall };
    }

    const message: ChatMessage = {
      role: "assistant",
      content: textParts.join(""),
      ...(finalToolCalls.length > 0 ? { toolCalls: finalToolCalls } : {})
    };
    yield { type: "done", message };
  }
}

interface WireChunk {
  choices?: {
    delta?: {
      content?: string | null;
      tool_calls?: {
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
  }[];
}

function toWireMessage(message: ChatMessage): Record<string, unknown> {
  if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
    return {
      role: "assistant",
      content: message.content ?? "",
      tool_calls: message.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments }
      }))
    };
  }
  if (message.role === "tool") {
    return { role: "tool", tool_call_id: message.toolCallId, content: message.content ?? "" };
  }
  return { role: message.role, content: message.content ?? "" };
}

function toWireTool(tool: ToolDefinition): Record<string, unknown> {
  return {
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.parameters }
  };
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "<no body>";
  }
}

/**
 * Parse an SSE stream, yielding the payload after each `data:` field. Handles
 * chunk boundaries that split lines. Web-standard `ReadableStream` input.
 */
export async function* iterateSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
        buffer = buffer.slice(newlineIndex + 1);
        const trimmed = line.trimStart();
        if (trimmed.startsWith("data:")) {
          yield trimmed.slice(5).trim();
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
