/**
 * Agentic turn helper: run one user message to completion, streaming events.
 *
 * `runTurn` drives the tool loop server-side (for the Fastify proxy) and yields
 * a typed event stream the web app can also consume to apply document mutations
 * locally: `textDelta` for assistant text, `toolCallStart`/`toolResult` around
 * each tool, `documentChanged` whenever the executor returns a new document,
 * and a final `done` carrying the final document + full message history.
 *
 * Safety: the loop caps at `maxToolRounds` (default 8) so a misbehaving model
 * can't loop forever. Each tool call goes through `executeTool`, which
 * validates arguments and routes placement through the deterministic solver —
 * the model never writes coordinates directly.
 */

import { roomCorners, type SceneDocument } from "@interior/core";
import type { CatalogItem } from "./catalog.js";
import { executeTool, type ExecuteContext } from "./executor.js";
import { buildSystemPrompt } from "./prompt.js";
import type { ChatMessage, ChatProvider, ToolCall } from "./provider.js";
import { toolDefinitions } from "./tools.js";

export type TurnEvent =
  | { type: "textDelta"; text: string }
  | { type: "toolCallStart"; toolCall: ToolCall }
  | { type: "toolResult"; toolCallId: string; toolName: string; result: unknown }
  | { type: "documentChanged"; document: SceneDocument }
  | { type: "done"; document: SceneDocument; messages: ChatMessage[] };

export interface RunTurnOptions {
  /** Prior conversation (assistant/user/tool messages), excluding the system prompt. */
  history?: ChatMessage[];
  /** Room to operate in; defaults to the document's first room. */
  roomId?: string;
  /** Deterministic id factory (tests); defaults to crypto.randomUUID. */
  generateId?: () => string;
  /** Untrusted free-text notes carried by a shared design. */
  sharedDesignNotes?: string;
  /** Max tool rounds before the loop stops (default 8). */
  maxToolRounds?: number;
  /** Abort signal forwarded to the provider. */
  signal?: AbortSignal;
  /** Sampling hint forwarded to the provider. */
  temperature?: number;
}

function roomSummary(document: SceneDocument, roomId?: string): string | undefined {
  const room = roomId ? document.rooms.find((r) => r.id === roomId) : document.rooms[0];
  if (!room) return undefined;
  if (room.walls.length === 0) return `${room.name} (no walls yet)`;
  const corners = roomCorners(room);
  const xs = corners.map((c) => c.x);
  const zs = corners.map((c) => c.z);
  const width = (Math.max(...xs) - Math.min(...xs)).toFixed(1);
  const depth = (Math.max(...zs) - Math.min(...zs)).toFixed(1);
  return `${room.name}, roughly ${width}m x ${depth}m, ${document.furniture.length} items placed.`;
}

/**
 * Run one assistant turn to completion.
 */
export async function* runTurn(
  provider: ChatProvider,
  document: SceneDocument,
  catalog: CatalogItem[],
  userMessage: string,
  options: RunTurnOptions = {}
): AsyncGenerator<TurnEvent> {
  const maxRounds = options.maxToolRounds ?? 8;
  const context: ExecuteContext = {
    catalog,
    ...(options.roomId ? { roomId: options.roomId } : {}),
    ...(options.generateId ? { generateId: options.generateId } : {})
  };

  let currentDoc = document;

  const systemPrompt = buildSystemPrompt({
    ...(roomSummary(currentDoc, options.roomId) ? { roomSummary: roomSummary(currentDoc, options.roomId) } : {}),
    catalog: catalog.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category,
      price: c.price,
      description: c.description
    })),
    ...(options.sharedDesignNotes ? { sharedDesignNotes: options.sharedDesignNotes } : {})
  });

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...(options.history ?? []),
    { role: "user", content: userMessage }
  ];

  for (let round = 0; round < maxRounds; round++) {
    let assistantMessage: ChatMessage = { role: "assistant", content: "" };

    const streamOptions: { messages: ChatMessage[]; tools: typeof toolDefinitions; signal?: AbortSignal; temperature?: number } = {
      messages,
      tools: toolDefinitions
    };
    if (options.signal) streamOptions.signal = options.signal;
    if (options.temperature !== undefined) streamOptions.temperature = options.temperature;

    for await (const event of provider.chat(streamOptions)) {
      if (event.type === "textDelta") {
        yield { type: "textDelta", text: event.text };
      } else if (event.type === "done") {
        assistantMessage = event.message;
      }
    }

    messages.push(assistantMessage);

    const toolCalls = assistantMessage.toolCalls ?? [];
    if (toolCalls.length === 0) {
      yield { type: "done", document: currentDoc, messages };
      return;
    }

    for (const toolCall of toolCalls) {
      yield { type: "toolCallStart", toolCall };
      const result = executeTool(currentDoc, toolCall, context);
      yield { type: "toolResult", toolCallId: toolCall.id, toolName: toolCall.name, result: result.resultForLLM };
      if (result.changed) {
        currentDoc = result.document;
        yield { type: "documentChanged", document: currentDoc };
      }
      messages.push({
        role: "tool",
        toolCallId: toolCall.id,
        name: toolCall.name,
        content: JSON.stringify(result.resultForLLM)
      });
    }
  }

  // Hit the tool-round cap: stop cleanly with whatever we have.
  yield { type: "done", document: currentDoc, messages };
}
