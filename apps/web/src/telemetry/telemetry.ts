/**
 * Minimal client error telemetry stub.
 *
 * `captureError` logs a structured JSON event to the console and buffers the
 * last N events in memory (exposed via `getTelemetryBuffer` for a future
 * backend sink / debugging). No network calls are made here.
 *
 * `installGlobalErrorHandlers` wires `window.onerror` +
 * `window.onunhandledrejection`. The React error boundary lives in
 * `./ErrorBoundary.tsx` and calls `captureError` from `componentDidCatch`.
 */

export const TELEMETRY_BUFFER_LIMIT = 50;

export type TelemetrySeverity = "error" | "warning";

export interface TelemetryEvent {
  timestamp: string; // ISO 8601
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  severity: TelemetrySeverity;
}

let buffer: TelemetryEvent[] = [];

function toEvent(
  err: unknown,
  context: Record<string, unknown> | undefined,
  severity: TelemetrySeverity
): TelemetryEvent {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  return {
    timestamp: new Date().toISOString(),
    message,
    stack,
    context,
    severity
  };
}

/** Capture a client error: logs structured JSON to console + buffers it. */
export function captureError(
  err: unknown,
  context?: Record<string, unknown>,
  severity: TelemetrySeverity = "error"
): TelemetryEvent {
  const event = toEvent(err, context, severity);
  buffer.push(event);
  if (buffer.length > TELEMETRY_BUFFER_LIMIT) buffer.shift();

  const log = severity === "warning" ? console.warn : console.error;
  // Structured JSON, one line, easy to grep / later ship to a backend sink.
  log(JSON.stringify({ source: "telemetry", ...event }));

  return event;
}

/** Snapshot of the in-memory buffer (most recent last), for a future
 *  backend sink or debugging. Does not mutate the internal buffer. */
export function getTelemetryBuffer(): readonly TelemetryEvent[] {
  return [...buffer];
}

export function clearTelemetryBuffer(): void {
  buffer = [];
}

/** Minimal shape of the window `error` / `unhandledrejection` events we read
 *  from — kept structural (not `ErrorEvent`/`PromiseRejectionEvent`) so
 *  handlers can be unit-tested against a plain `EventTarget` without a real
 *  DOM/browser `window`. */
interface ErrorEventLike extends Event {
  error?: unknown;
  message?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
}
interface RejectionEventLike extends Event {
  reason?: unknown;
}

function defaultTarget(): EventTarget {
  return typeof window !== "undefined" ? window : (globalThis as unknown as EventTarget);
}

let handlersInstalled = false;
let onErrorHandler: ((ev: Event) => void) | null = null;
let onRejectionHandler: ((ev: Event) => void) | null = null;

/** Install window.onerror / unhandledrejection handlers exactly once.
 *  Safe to call multiple times (module-render-time, hot reload, tests).
 *  Accepts any `EventTarget` (defaults to `window`) so it's unit-testable
 *  without a real browser. */
export function installGlobalErrorHandlers(target: EventTarget = defaultTarget()): () => void {
  if (handlersInstalled) return () => {};

  onErrorHandler = (ev: Event) => {
    const e = ev as ErrorEventLike;
    captureError(e.error ?? e.message ?? "unknown error", {
      source: "window.onerror",
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno
    });
  };
  onRejectionHandler = (ev: Event) => {
    const e = ev as RejectionEventLike;
    captureError(e.reason, { source: "unhandledrejection" });
  };

  target.addEventListener("error", onErrorHandler);
  target.addEventListener("unhandledrejection", onRejectionHandler);
  handlersInstalled = true;

  return () => uninstallGlobalErrorHandlers(target);
}

export function uninstallGlobalErrorHandlers(target: EventTarget = defaultTarget()): void {
  if (!handlersInstalled) return;
  if (onErrorHandler) target.removeEventListener("error", onErrorHandler);
  if (onRejectionHandler) target.removeEventListener("unhandledrejection", onRejectionHandler);
  onErrorHandler = null;
  onRejectionHandler = null;
  handlersInstalled = false;
}
