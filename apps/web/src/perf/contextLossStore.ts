/**
 * Tiny external pub-sub store carrying WebGL context-loss state from inside
 * the `Canvas` (where the loss/restore events + the GL handle live) out to
 * the DOM-overlay banner and the HUD's "simulate loss" button.
 */

export type ContextLossListener = () => void;

let lost = false;
/** Set from inside the Canvas once `gl` is available; lets the HUD trigger
 *  a simulated context loss without the HUD needing direct GL access. */
let simulateFn: (() => void) | null = null;

const listeners = new Set<ContextLossListener>();

function notify(): void {
  for (const l of listeners) l();
}

export function setContextLost(next: boolean): void {
  if (lost === next) return;
  lost = next;
  notify();
}

export function isContextLost(): boolean {
  return lost;
}

export function setSimulateContextLossFn(fn: (() => void) | null): void {
  simulateFn = fn;
}

export function getSimulateContextLossFn(): (() => void) | null {
  return simulateFn;
}

export function subscribeContextLoss(listener: ContextLossListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test/dev helper. */
export function resetContextLossStore(): void {
  lost = false;
  simulateFn = null;
}
