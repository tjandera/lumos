/**
 * Tiny external pub-sub store for one-line dismissable toasts (same pattern
 * as `perfStore`/`contextLossStore`). Currently used for the "reduced
 * quality for smoothness" notice; generic enough to reuse elsewhere.
 */

export interface ToastState {
  id: number;
  message: string;
}

export type ToastListener = () => void;

let current: ToastState | null = null;
let counter = 0;
const listeners = new Set<ToastListener>();

function notify(): void {
  for (const l of listeners) l();
}

export function pushToast(message: string): void {
  counter += 1;
  current = { id: counter, message };
  notify();
}

export function clearToast(id?: number): void {
  if (current === null) return;
  if (id !== undefined && current.id !== id) return;
  current = null;
  notify();
}

export function getToast(): ToastState | null {
  return current;
}

export function subscribeToast(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
