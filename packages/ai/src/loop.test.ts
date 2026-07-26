import { describe, expect, it } from "vitest";
import { sceneDocumentSchema } from "@interior/core";
import { runTurn, type TurnEvent } from "./loop.js";
import { MockProvider, resetMockProvider } from "./providers/mock.js";
import type { ProviderEvent } from "./provider.js";
import { docWithRoom, testCatalog } from "./test-fixtures.js";

function idFactory(): () => string {
  let n = 0;
  return () => `gen-${++n}`;
}

async function collect(gen: AsyncGenerator<TurnEvent>): Promise<TurnEvent[]> {
  const events: TurnEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe("runTurn with MockProvider", () => {
  it("drives user message -> suggestLayout -> solver -> documentChanged -> done", async () => {
    resetMockProvider();
    const provider = new MockProvider();
    const doc = docWithRoom();

    const events = await collect(
      runTurn(provider, doc, testCatalog, "Please suggest a cozy living room under $3000", { generateId: idFactory() })
    );

    const types = events.map((e) => e.type);
    expect(types).toContain("toolCallStart");
    expect(types).toContain("toolResult");
    expect(types).toContain("documentChanged");
    expect(types).toContain("done");

    const toolStart = events.find((e) => e.type === "toolCallStart");
    expect(toolStart && toolStart.type === "toolCallStart" && toolStart.toolCall.name).toBe("suggestLayout");

    const done = events.find((e) => e.type === "done");
    if (!done || done.type !== "done") throw new Error("no done event");
    expect(done.document.furniture.length).toBeGreaterThan(0);
    // Resulting document passes core schema validation.
    expect(sceneDocumentSchema.safeParse(done.document).success).toBe(true);
    // History includes a tool result message.
    expect(done.messages.some((m) => m.role === "tool")).toBe(true);
  });

  it("streams assistant text and finishes without tools for a plain question", async () => {
    resetMockProvider();
    const provider = new MockProvider();
    const events = await collect(
      runTurn(provider, docWithRoom(), testCatalog, "hello there", { generateId: idFactory() })
    );
    expect(events.some((e) => e.type === "textDelta")).toBe(true);
    expect(events.filter((e) => e.type === "toolCallStart")).toHaveLength(0);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("caps tool rounds so a looping model still terminates", async () => {
    // A provider that ALWAYS asks for querySpace again would loop forever.
    let callId = 0;
    const script: ProviderEvent[][] = Array.from({ length: 20 }, () => {
      callId += 1;
      const toolCall = { id: `c-${callId}`, name: "querySpace", arguments: "{}" };
      return [{ type: "toolCall", toolCall }, { type: "done", message: { role: "assistant", content: "", toolCalls: [toolCall] } }] as ProviderEvent[];
    });
    const provider = new MockProvider({ script });
    const events = await collect(
      runTurn(provider, docWithRoom(), testCatalog, "loop please", { generateId: idFactory(), maxToolRounds: 3 })
    );
    // Exactly maxToolRounds tool calls, then a done.
    expect(events.filter((e) => e.type === "toolCallStart")).toHaveLength(3);
    expect(events.at(-1)?.type).toBe("done");
  });
});
