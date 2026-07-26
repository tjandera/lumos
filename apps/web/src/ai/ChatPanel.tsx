/**
 * Collapsible "Assistant" drawer for the 3D tab. Coexists with
 * `LightingPanel` as a sibling column (not a takeover) so both stay
 * reachable at once; collapses to a thin vertical tab when not in use.
 * Rendered only when `isEnabled("ai")` — see `App.tsx`.
 */

import { useEffect, useRef, useState } from "react";
import { fetchAiStatus, type AiStatus } from "./aiClient";
import { SUGGESTED_PROMPTS, useAiChatStore } from "./chatStore";

const panelFont: React.CSSProperties = { fontFamily: "sans-serif" };

export function ChatPanel() {
  const [open, setOpen] = useState(true);
  const messages = useAiChatStore((s) => s.messages);
  const streaming = useAiChatStore((s) => s.streaming);
  const error = useAiChatStore((s) => s.error);
  const sendMessage = useAiChatStore((s) => s.sendMessage);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Best-effort probe of `GET /ai/status` so the empty state can be honest
  // about whether replies come from a real LLM or the built-in offline mock
  // (the assistant is on by default, but with no `AI_PROVIDER_BASE_URL`
  // configured the API falls back to `MockProvider`). Failure just leaves
  // this `null` and the empty state omits the note.
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetchAiStatus(controller.signal).then(setAiStatus);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, streaming]);

  function submit(text: string) {
    if (streaming) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    setDraft("");
    void sendMessage(trimmed);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open assistant"
        style={{
          ...panelFont,
          width: 32,
          borderLeft: "1px solid #ddd",
          background: "#fafafa",
          cursor: "pointer",
          fontSize: 12,
          writingMode: "vertical-rl",
          textOrientation: "mixed"
        }}
      >
        Assistant
      </button>
    );
  }

  return (
    <div style={{ ...panelFont, width: 320, borderLeft: "1px solid #ddd", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid #ddd"
        }}
      >
        <strong style={{ fontSize: 14 }}>Assistant</strong>
        <button
          onClick={() => setOpen(false)}
          aria-label="Collapse assistant"
          style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
        >
          ›
        </button>
      </div>

      <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <p style={{ fontSize: 12, color: "#666", margin: "0 0 4px" }}>
              Try: “suggest a cozy living room layout”.
              {aiStatus?.provider === "mock"
                ? " Without an AI key configured, I use built-in arrangement logic — no LLM calls, works fully offline."
                : " Ask me to arrange furniture, suggest a layout, or check what fits."}
            </p>
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => submit(prompt)}
                style={{
                  textAlign: "left",
                  fontSize: 12,
                  padding: "6px 10px",
                  borderRadius: 14,
                  border: "1px solid #ccc",
                  background: "#f5f5f5",
                  cursor: "pointer"
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "92%" }}>
            <div
              style={{
                background: m.role === "user" ? "#dbe7ff" : "#f1f1f1",
                borderRadius: 10,
                padding: "8px 10px",
                fontSize: 13,
                whiteSpace: "pre-wrap",
                minHeight: m.role === "assistant" ? 18 : undefined
              }}
            >
              {m.text || (m.role === "assistant" && streaming ? "…" : "")}
            </div>
            {m.toolActivity.length > 0 && (
              <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                {m.toolActivity.map((t) => (
                  <div
                    key={t.toolCallId}
                    style={{ fontSize: 11, color: t.status === "failed" ? "#b3261e" : "#777", display: "flex", gap: 4 }}
                  >
                    <span>{t.status === "running" ? "⏳" : t.status === "failed" ? "⚠" : "✓"}</span>
                    <span>{t.status === "failed" && t.detail ? t.detail : t.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {error && (
          <div style={{ fontSize: 12, color: "#b3261e", background: "#fdecea", padding: "6px 10px", borderRadius: 6 }}>{error}</div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
        style={{ display: "flex", gap: 6, padding: 10, borderTop: "1px solid #ddd" }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={streaming ? "Thinking…" : "Ask the assistant…"}
          disabled={streaming}
          style={{ flex: 1, padding: "6px 8px", fontSize: 13, boxSizing: "border-box" }}
        />
        <button type="submit" disabled={streaming || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
