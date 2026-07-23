/**
 * AI chat state: message list (with inline tool-activity), streaming
 * status, and the conversation history sent back to the server on the next
 * turn. Talks to the API only through `./aiClient`; document mutations are
 * applied to `sceneStore` exactly once per assistant turn — see
 * `applyPendingDocument` below — via `sceneStore.batch(label, fn)`, so an
 * entire multi-tool-call AI turn is a single undo step.
 */

import { create } from "zustand";
import type { ChatMessage, ToolCall, TurnEvent } from "@interior/ai";
import type { SceneDocument } from "@interior/core";
import { getCatalogItem } from "../catalog/catalogData";
import { generateId } from "../editor/roomOps";
import { useSceneStore } from "../store/sceneStore";
import { AiChatError, streamChat } from "./aiClient";

export const SUGGESTED_PROMPTS = [
  "I'm new to this, can you design a basic living room for me?",
  "Suggest a cozy living-room layout",
  "What fits in this corner?",
  "I need a sofa under $500, what do you suggest?"
];

export type ToolActivityStatus = "running" | "done" | "failed";

export interface ToolActivityEntry {
  toolCallId: string;
  toolName: string;
  /** Present-tense/gerund label shown while running or on success, e.g. "Placing sofa…". */
  label: string;
  status: ToolActivityStatus;
  /** Structured failure text ("Couldn't fit the wardrobe: no clearance") when `status === "failed"`. */
  detail?: string;
}

export interface ChatUIMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolActivity: ToolActivityEntry[];
}

export interface AiChatState {
  messages: ChatUIMessage[];
  /** Conversation history (assistant/user/tool messages, no system message) sent on the next turn. */
  history: ChatMessage[];
  streaming: boolean;
  error: string | null;

  sendMessage: (text: string) => Promise<void>;
  reset: () => void;
}

function toolLabel(toolCall: ToolCall): string {
  const args = parseArgsForDisplay(toolCall.arguments);
  switch (toolCall.name) {
    case "placeFurniture": {
      const catalogId = typeof args.catalogId === "string" ? args.catalogId : undefined;
      const name = (catalogId && getCatalogItem(catalogId)?.name) || catalogId || "an item";
      return `Placing ${name}…`;
    }
    case "moveItem":
      return "Moving the item…";
    case "removeItem":
      return "Removing the item…";
    case "setTimeOfDay": {
      const time = typeof args.time === "string" ? args.time : undefined;
      return time ? `Setting the time to ${time}…` : "Adjusting the lighting…";
    }
    case "toggleLamp":
      return args.on === false ? "Turning off a lamp…" : "Turning on a lamp…";
    case "querySpace":
      return "Checking the room…";
    case "suggestLayout":
      return "Suggesting a layout…";
    default:
      return `Running ${toolCall.name}…`;
  }
}

function toolVerb(toolName: string): string {
  switch (toolName) {
    case "placeFurniture":
      return "place the item";
    case "moveItem":
      return "move the item";
    case "removeItem":
      return "remove the item";
    case "setTimeOfDay":
      return "set the time";
    case "toggleLamp":
      return "toggle the lamp";
    case "querySpace":
      return "check the room";
    case "suggestLayout":
      return "build the layout";
    default:
      return "do that";
  }
}

/** Parse a tool call's JSON-string arguments defensively, for display purposes only. */
function parseArgsForDisplay(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Derive success/failure + a structured detail message from a tool's `resultForLLM`. */
function toolResultStatus(toolName: string, result: unknown): { status: ToolActivityStatus; detail?: string } {
  if (result && typeof result === "object" && "ok" in result) {
    const r = result as { ok: boolean; message?: string; error?: string; failed?: { message?: string }[] };
    if (r.ok === false) {
      const reason = r.message ?? r.failed?.find((f) => f.message)?.message ?? r.error ?? "the request could not be completed";
      return { status: "failed", detail: `Couldn't ${toolVerb(toolName)}: ${reason}` };
    }
  }
  return { status: "done" };
}

export const useAiChatStore = create<AiChatState>((set, get) => ({
  messages: [],
  history: [],
  streaming: false,
  error: null,

  sendMessage: async (text: string) => {
    if (get().streaming) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMessage: ChatUIMessage = { id: generateId("chat"), role: "user", text: trimmed, toolActivity: [] };
    const assistantId = generateId("chat");
    const assistantMessage: ChatUIMessage = { id: assistantId, role: "assistant", text: "", toolActivity: [] };

    set((state) => ({
      messages: [...state.messages, userMessage, assistantMessage],
      streaming: true,
      error: null
    }));

    const startDocument = useSceneStore.getState().document;
    let pendingDocument: SceneDocument | null = null;

    function updateAssistant(mutate: (msg: ChatUIMessage) => ChatUIMessage): void {
      set((state) => ({
        messages: state.messages.map((m) => (m.id === assistantId ? mutate(m) : m))
      }));
    }

    try {
      for await (const event of streamChat({
        document: startDocument,
        messages: get().history,
        userMessage: trimmed
      })) {
        applyEvent(event as TurnEvent | { type: "error"; message: string });
      }
    } catch (err) {
      const message = err instanceof AiChatError ? err.message : "Something went wrong talking to the assistant.";
      set({ error: message });
      updateAssistant((m) => ({
        ...m,
        text: m.text || message,
        toolActivity: m.toolActivity.map((t) => (t.status === "running" ? { ...t, status: "failed" as const } : t))
      }));
    }

    // Apply the whole turn's document mutation (if any) as exactly one undo
    // batch. Ignoring the store's *current* document and substituting the
    // AI's final document is the "loadDocument-style replacement" the whole
    // turn shares — see `sceneStore.batch`'s docstring. Skip entirely if the
    // turn never actually changed the document (no tool mutated it) so a
    // pure Q&A turn doesn't leave a no-op undo entry.
    if (pendingDocument && pendingDocument !== startDocument) {
      const finalDoc = pendingDocument;
      useSceneStore.getState().batch(`AI: ${trimmed.slice(0, 60)}`, () => finalDoc);
    }

    set({ streaming: false });

    function applyEvent(event: TurnEvent | { type: "error"; message: string }): void {
      switch (event.type) {
        case "textDelta":
          updateAssistant((m) => ({ ...m, text: m.text + event.text }));
          break;
        case "toolCallStart":
          updateAssistant((m) => ({
            ...m,
            toolActivity: [
              ...m.toolActivity,
              { toolCallId: event.toolCall.id, toolName: event.toolCall.name, label: toolLabel(event.toolCall), status: "running" }
            ]
          }));
          break;
        case "toolResult": {
          const { status, detail } = toolResultStatus(event.toolName, event.result);
          updateAssistant((m) => ({
            ...m,
            toolActivity: m.toolActivity.map((t) =>
              t.toolCallId === event.toolCallId ? { ...t, status, ...(detail ? { detail } : {}) } : t
            )
          }));
          break;
        }
        case "documentChanged":
          pendingDocument = event.document;
          break;
        case "done":
          pendingDocument = event.document;
          // Strip the leading system message the server always injects; we
          // resend our own request-time context each turn.
          set({ history: event.messages.slice(1) });
          break;
        case "error":
          set({ error: event.message });
          updateAssistant((m) => ({ ...m, text: m.text || event.message }));
          break;
        default:
          break;
      }
    }
  },

  reset: () => set({ messages: [], history: [], streaming: false, error: null })
}));
