/**
 * Model-agnostic chat/tool-calling abstraction.
 *
 * Types follow the OpenAI-ish wire shape (roles, `tool_calls` with a name + a
 * JSON-string `arguments`, `tool` messages carrying results by id) so a
 * concrete provider can be a thin adapter, but nothing here is tied to a
 * specific vendor or model — the model name is always config.
 */

export type ChatRole = "system" | "user" | "assistant" | "tool";

/**
 * A tool call requested by the assistant. `arguments` is a JSON STRING (as
 * emitted on the wire); the executor parses + validates it with the tool's zod
 * schema before doing anything.
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatMessage {
  role: ChatRole;
  /** Assistant/user/system text, or the tool result JSON for `role: "tool"`. */
  content?: string;
  /** Present on assistant messages that requested tool calls. */
  toolCalls?: ToolCall[];
  /** Present on `role: "tool"` messages: the id of the call being answered. */
  toolCallId?: string;
  /** Optional tool name (for `role: "tool"` messages). */
  name?: string;
}

/** A tool exposed to the model. `parameters` is a JSON Schema (derived from zod). */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  /** Optional per-call sampling hint; providers may ignore it. */
  temperature?: number;
  signal?: AbortSignal;
}

/** Streamed output from a provider. */
export type ProviderEvent =
  | { type: "textDelta"; text: string }
  | { type: "toolCall"; toolCall: ToolCall }
  | { type: "done"; message: ChatMessage };

/**
 * A chat provider streams assistant deltas + tool calls for a request. The
 * final `done` event carries the fully-assembled assistant message (text +
 * any tool calls) so callers don't have to reassemble deltas themselves.
 */
export interface ChatProvider {
  /** The configured model name (never hardcoded in the library). */
  readonly model: string;
  chat(request: ChatRequest): AsyncIterable<ProviderEvent>;
}
