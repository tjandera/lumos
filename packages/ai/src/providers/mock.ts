/**
 * Deterministic mock chat provider for tests and offline development.
 *
 * Two modes:
 *  - Scripted: hand it a queue of `ProviderEvent[]` turns; each `chat()` call
 *    replays the next turn. Exhausted → a default "done" with a short message.
 *  - Heuristic (default): a tiny rule set that mimics a real assistant well
 *    enough to exercise the whole loop offline — e.g. "suggest a cozy living
 *    room" emits a `suggestLayout` tool call with sensible constraints, and a
 *    follow-up (after the tool result) emits a natural-language summary.
 *
 * Everything is deterministic: no randomness, no timers.
 */

import type { ChatMessage, ChatProvider, ChatRequest, ProviderEvent, ToolCall } from "../provider.js";

let mockToolCallCounter = 0;
function nextToolCallId(): string {
  mockToolCallCounter += 1;
  return `mock-call-${mockToolCallCounter}`;
}

/** Reset the deterministic tool-call id counter (useful between tests). */
export function resetMockProvider(): void {
  mockToolCallCounter = 0;
}

export type MockResponder = (request: ChatRequest) => ProviderEvent[];

export interface MockProviderOptions {
  model?: string;
  /** A fixed queue of turns to replay in order. */
  script?: ProviderEvent[][];
  /** A custom responder; overrides the built-in heuristic. */
  responder?: MockResponder;
}

function textThenDone(text: string): ProviderEvent[] {
  return [
    { type: "textDelta", text },
    { type: "done", message: { role: "assistant", content: text } }
  ];
}

function toolCallTurn(name: string, args: unknown, preface?: string): ProviderEvent[] {
  const toolCall: ToolCall = { id: nextToolCallId(), name, arguments: JSON.stringify(args) };
  const events: ProviderEvent[] = [];
  const content = preface ?? "";
  if (preface) events.push({ type: "textDelta", text: preface });
  events.push({ type: "toolCall", toolCall });
  events.push({ type: "done", message: { role: "assistant", content, toolCalls: [toolCall] } });
  return events;
}

function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as ChatMessage;
    if (m.role === "user") return m.content ?? "";
  }
  return "";
}

/** Whether a tool result is already present in the conversation (loop 2+). */
function hasToolResult(messages: ChatMessage[]): boolean {
  return messages.some((m) => m.role === "tool");
}

/**
 * The built-in heuristic responder. Deterministic and intentionally small — it
 * covers the flows the tests and offline dev need, not general chat.
 */
export function defaultResponder(request: ChatRequest): ProviderEvent[] {
  const messages = request.messages;
  const text = lastUserText(messages).toLowerCase();

  // Second pass (a tool has already run): summarize and finish.
  if (hasToolResult(messages)) {
    return textThenDone("Done — I've updated your room. Let me know if you'd like to adjust anything.");
  }

  if (/suggest|layout|furnish|cozy|cosy|living room|set up the room/.test(text)) {
    const args: { style: string; budget?: number } = { style: "cozy" };
    const budget = parseBudget(text);
    if (budget !== undefined) args.budget = budget;
    return toolCallTurn("suggestLayout", args, "Sure — let me put together a cozy layout for you.");
  }

  if (/what.*(room|space|fit)|how much (room|space)|dimensions|free (floor|space)/.test(text)) {
    return toolCallTurn("querySpace", {}, "Let me check the room first.");
  }

  if (/(evening|night|sunset|golden hour)/.test(text)) {
    return toolCallTurn("setTimeOfDay", { time: "19:00" }, "Setting an evening light.");
  }

  return textThenDone("I can arrange furniture, suggest a layout, or adjust the lighting — what would you like?");
}

function parseBudget(text: string): number | undefined {
  const match = text.match(/\$?\s*(\d[\d,]*)\s*(k)?/);
  if (!match) return undefined;
  const digits = Number((match[1] as string).replace(/,/g, ""));
  if (!Number.isFinite(digits)) return undefined;
  return match[2] ? digits * 1000 : digits;
}

/**
 * A deterministic `ChatProvider` for tests and offline dev.
 */
export class MockProvider implements ChatProvider {
  readonly model: string;
  private readonly script?: ProviderEvent[][];
  private readonly responder: MockResponder;
  private scriptIndex = 0;

  constructor(options: MockProviderOptions = {}) {
    this.model = options.model ?? "mock-model";
    this.script = options.script;
    this.responder = options.responder ?? defaultResponder;
  }

  async *chat(request: ChatRequest): AsyncIterable<ProviderEvent> {
    let events: ProviderEvent[];
    if (this.script) {
      events = this.script[this.scriptIndex] ?? textThenDone("(end of script)");
      this.scriptIndex += 1;
    } else {
      events = this.responder(request);
    }
    for (const event of events) {
      yield event;
    }
  }
}
