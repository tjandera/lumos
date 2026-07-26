/**
 * WebGL context-loss handling.
 *
 * `attachContextLossHandlers` is factored to accept any `EventTarget` (the
 * canvas element in production, a plain `EventTarget` in tests) so the
 * preventDefault-on-loss behavior is unit-testable without a real GL
 * context. `simulateContextLoss` is a dev-only helper (uses the
 * `WEBGL_lose_context` extension) wired to a HUD button for manual testing —
 * it needs a real GL context so it isn't unit-tested.
 */

export interface ContextLossHandlers {
  onLost: () => void;
  onRestored: () => void;
}

/** Attach webglcontextlost/webglcontextrestored listeners. On loss, calls
 *  `preventDefault()` on the event (required for the context to be
 *  restorable) then `onLost`. Returns a cleanup function. */
export function attachContextLossHandlers(target: EventTarget, handlers: ContextLossHandlers): () => void {
  const lost = (e: Event) => {
    e.preventDefault();
    handlers.onLost();
  };
  const restored = () => handlers.onRestored();

  target.addEventListener("webglcontextlost", lost, false);
  target.addEventListener("webglcontextrestored", restored, false);

  return () => {
    target.removeEventListener("webglcontextlost", lost, false);
    target.removeEventListener("webglcontextrestored", restored, false);
  };
}

interface LoseContextExtension {
  loseContext: () => void;
  restoreContext: () => void;
}

/** Dev helper: force a context loss (and auto-restore after `restoreDelayMs`)
 *  via the `WEBGL_lose_context` extension, to manually exercise the
 *  loss/restore UI. No-op if the extension isn't available. */
export function simulateContextLoss(
  gl: { getExtension: (name: "WEBGL_lose_context") => LoseContextExtension | null },
  restoreDelayMs = 2000
): void {
  const ext = gl.getExtension("WEBGL_lose_context");
  if (!ext) {
    console.warn("[perf] WEBGL_lose_context extension not available — cannot simulate context loss");
    return;
  }
  ext.loseContext();
  setTimeout(() => ext.restoreContext(), restoreDelayMs);
}
