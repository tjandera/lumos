import { afterEach, describe, expect, it, vi } from "vitest";
import type { TurnEvent } from "@interior/ai";
import { createEmptyDocument, type SceneDocument } from "@interior/core";
import { useSceneStore } from "../store/sceneStore";
import { AiChatError } from "./aiClient";
import { useAiChatStore } from "./chatStore";

vi.mock("./aiClient", async () => {
  const actual = await vi.importActual<typeof import("./aiClient")>("./aiClient");
  return { ...actual, streamChat: vi.fn() };
});

import { streamChat } from "./aiClient";

function scriptedEvents(events: (TurnEvent | { type: "error"; message: string })[]) {
  return async function* () {
    for (const event of events) {
      yield event;
    }
  };
}

function docWithOneFurnitureItem(): SceneDocument {
  const base = createEmptyDocument("Test");
  return {
    ...base,
    furniture: [
      { id: "f1", catalogId: "sofa-oslo-3seat", position: { x: 0, y: 0, z: 0 }, rotationY: 0, dimensions: { w: 1, d: 1, h: 1 } }
    ]
  };
}

describe("useAiChatStore", () => {
  afterEach(() => {
    useAiChatStore.getState().reset();
    useSceneStore.getState().reset();
    vi.mocked(streamChat).mockReset();
  });

  it("appends user + assistant messages and streams text deltas live", async () => {
    vi.mocked(streamChat).mockImplementation(
      scriptedEvents([
        { type: "textDelta", text: "Sure — " },
        { type: "textDelta", text: "here you go." },
        { type: "done", document: useSceneStore.getState().document, messages: [{ role: "system", content: "sys" }] }
      ])
    );

    await useAiChatStore.getState().sendMessage("Suggest a cozy layout");

    const { messages, streaming } = useAiChatStore.getState();
    expect(streaming).toBe(false);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "user", text: "Suggest a cozy layout" });
    expect(messages[1]).toMatchObject({ role: "assistant", text: "Sure — here you go." });
  });

  it("renders tool activity, including a structured failure message", async () => {
    vi.mocked(streamChat).mockImplementation(
      scriptedEvents([
        { type: "toolCallStart", toolCall: { id: "c1", name: "placeFurniture", arguments: JSON.stringify({ catalogId: "storage-wardrobe-alden" }) } },
        {
          type: "toolResult",
          toolCallId: "c1",
          toolName: "placeFurniture",
          result: { ok: false, error: "not_placed", message: "no clearance" }
        },
        { type: "done", document: useSceneStore.getState().document, messages: [{ role: "system", content: "sys" }] }
      ])
    );

    await useAiChatStore.getState().sendMessage("Add a wardrobe");

    const assistant = useAiChatStore.getState().messages[1];
    expect(assistant?.toolActivity).toHaveLength(1);
    expect(assistant?.toolActivity[0]).toMatchObject({ status: "failed", detail: "Couldn't place the item: no clearance" });
  });

  it("applies a whole AI turn's document change as exactly one undo batch", async () => {
    const changedDoc = docWithOneFurnitureItem();
    vi.mocked(streamChat).mockImplementation(
      scriptedEvents([
        { type: "toolCallStart", toolCall: { id: "c1", name: "suggestLayout", arguments: "{}" } },
        { type: "documentChanged", document: changedDoc },
        { type: "toolResult", toolCallId: "c1", toolName: "suggestLayout", result: { ok: true } },
        { type: "done", document: changedDoc, messages: [{ role: "system", content: "sys" }] }
      ])
    );

    const historyBefore = useSceneStore.getState().history.past.length;

    await useAiChatStore.getState().sendMessage("Suggest a cozy layout");

    // Exactly one new undo entry for the whole turn, however many tool calls it made.
    expect(useSceneStore.getState().history.past.length).toBe(historyBefore + 1);
    expect(useSceneStore.getState().document.furniture).toHaveLength(1);
    expect(useSceneStore.getState().canUndo()).toBe(true);

    useSceneStore.getState().undo();
    expect(useSceneStore.getState().document.furniture).toHaveLength(0);
  });

  it("does not create an undo entry when the AI turn made no document changes", async () => {
    vi.mocked(streamChat).mockImplementation(
      scriptedEvents([{ type: "done", document: useSceneStore.getState().document, messages: [{ role: "system", content: "sys" }] }])
    );

    await useAiChatStore.getState().sendMessage("What fits in this corner?");

    expect(useSceneStore.getState().canUndo()).toBe(false);
  });

  it("surfaces API-down / flag-off errors as a graceful chat message, without touching the document", async () => {
    // eslint-disable-next-line require-yield -- deliberately throws before any event; mocks the pre-stream failure path
    vi.mocked(streamChat).mockImplementation(async function* (): AsyncGenerator<TurnEvent> {
      throw new AiChatError("The AI assistant is turned off on the server (FEATURE_AI is not enabled).", 404);
    });

    await useAiChatStore.getState().sendMessage("Suggest a layout");

    const state = useAiChatStore.getState();
    expect(state.error).toMatch(/FEATURE_AI/);
    expect(state.messages[1]?.text).toMatch(/FEATURE_AI/);
    expect(useSceneStore.getState().canUndo()).toBe(false);
  });

  it("keeps a running conversation history (sans system message) for the next turn", async () => {
    const finalMessages = [
      { role: "system" as const, content: "sys" },
      { role: "user" as const, content: "hi" },
      { role: "assistant" as const, content: "hello!" }
    ];
    vi.mocked(streamChat).mockImplementation(
      scriptedEvents([
        { type: "textDelta", text: "hello!" },
        { type: "done", document: useSceneStore.getState().document, messages: finalMessages }
      ])
    );

    await useAiChatStore.getState().sendMessage("hi");

    expect(useAiChatStore.getState().history).toEqual(finalMessages.slice(1));
  });
});
