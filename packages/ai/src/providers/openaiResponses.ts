import type {
  ChatMessage,
  ChatProvider,
  ChatRequest,
  ProviderEvent,
  ToolCall,
  ToolDefinition
} from "../provider.js";
import { iterateSSE } from "./openai.js";

export interface OpenAIResponsesConfig {
  /** Model name — e.g. "gpt-5.6-sol" */
  model: string;
  /** API key sent as a Bearer token */
  apiKey?: string;
  /** Base URL, e.g. "https://api.openai.com/v1" (no trailing slash required). */
  baseURL?: string;
  /** Extra headers to merge into every request. */
  headers?: Record<string, string>;
  /** Injectable fetch (defaults to the global). */
  fetchImpl?: typeof fetch;
}

export class OpenAIResponsesProvider implements ChatProvider {
  readonly model: string;
  private readonly config: OpenAIResponsesConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OpenAIResponsesConfig) {
    this.config = config;
    this.model = config.model;
    const impl = config.fetchImpl ?? globalThis.fetch;
    if (!impl) throw new Error("No fetch implementation available; pass config.fetchImpl");
    this.fetchImpl = impl;
  }

  async *chat(request: ChatRequest): AsyncIterable<ProviderEvent> {
    const baseURL = this.config.baseURL || "https://api.openai.com/v1";
    const url = `${baseURL.replace(/\/$/, "")}/responses`;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
      ...this.config.headers
    };

    const input = request.messages.map((m) => {
      if (m.role === "tool") {
        return {
          type: "function_call_output",
          call_id: m.toolCallId,
          output: m.content ?? ""
        };
      } else if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: "assistant",
          content: m.toolCalls.map(tc => ({
            type: "function_call",
            call_id: tc.id,
            name: tc.name,
            arguments: tc.arguments
          }))
        };
      } else {
        return {
          role: m.role,
          content: m.content ?? ""
        };
      }
    });

    const body = JSON.stringify({
      model: this.config.model,
      stream: true,
      input,
      ...(request.tools && request.tools.length > 0 ? {
        tools: request.tools.map((tool) => ({
          type: "function",
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          strict: false
        }))
      } : {})
    });

    const response = await this.fetchImpl(url, { method: "POST", headers, body, signal: request.signal });
    if (!response.ok || !response.body) {
      let detail = "<no body>";
      try {
        detail = (await response.text()).slice(0, 500);
      } catch {
        /* body unreadable — keep placeholder */
      }
      throw new Error(`Chat request failed (${response.status}): ${detail}`);
    }

    const toolCalls: ToolCall[] = [];
    let doneMessage: ChatMessage | null = null;

    for await (const data of iterateSSE(response.body)) {
      if (data === "[DONE]") break;
      let chunk: any;
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      
      if (chunk.type === "response.output_text.delta" && chunk.textDelta) {
        yield { type: "textDelta", text: chunk.textDelta };
      }
      
      if (chunk.type === "response.output_item.done" && chunk.item?.type === "function_call") {
        const tc: ToolCall = {
          id: chunk.item.call_id,
          name: chunk.item.name,
          arguments: chunk.item.arguments || "{}"
        };
        toolCalls.push(tc);
        yield { type: "toolCall", toolCall: tc };
      }
      
      if (chunk.type === "response.completed") {
        // Complete final text reconstruction from response.completed.response.output
        let textContent = "";
        const outputs = chunk.response?.output || [];
        for (const out of outputs) {
          if (out.type === "message" && out.content) {
            for (const c of out.content) {
              if (c.type === "output_text" && c.text) {
                textContent += c.text;
              }
            }
          }
        }
        doneMessage = {
          role: "assistant",
          content: textContent,
          ...(toolCalls.length > 0 ? { toolCalls } : {})
        };
      }
    }
    
    if (doneMessage) {
      yield { type: "done", message: doneMessage };
    }
  }
}
