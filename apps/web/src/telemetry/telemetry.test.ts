import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureError,
  clearTelemetryBuffer,
  getTelemetryBuffer,
  installGlobalErrorHandlers,
  TELEMETRY_BUFFER_LIMIT,
  uninstallGlobalErrorHandlers
} from "./telemetry";

describe("telemetry buffer/capture", () => {
  beforeEach(() => {
    clearTelemetryBuffer();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearTelemetryBuffer();
  });

  it("captures an Error with message + stack", () => {
    const event = captureError(new Error("boom"), { where: "test" });
    expect(event.message).toBe("boom");
    expect(event.stack).toBeDefined();
    expect(event.context).toEqual({ where: "test" });
    expect(event.severity).toBe("error");
  });

  it("captures non-Error values by stringifying them", () => {
    const event = captureError("plain string error");
    expect(event.message).toBe("plain string error");
    expect(event.stack).toBeUndefined();
  });

  it("logs structured JSON to console.error by default", () => {
    captureError(new Error("logged"));
    expect(console.error).toHaveBeenCalledTimes(1);
    const arg = (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    const parsed = JSON.parse(arg);
    expect(parsed.message).toBe("logged");
    expect(parsed.source).toBe("telemetry");
  });

  it("logs to console.warn for warning severity", () => {
    captureError(new Error("warn me"), undefined, "warning");
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("buffers events, most recent order preserved", () => {
    captureError(new Error("first"));
    captureError(new Error("second"));
    const buf = getTelemetryBuffer();
    expect(buf).toHaveLength(2);
    expect(buf[0]?.message).toBe("first");
    expect(buf[1]?.message).toBe("second");
  });

  it("caps the buffer at TELEMETRY_BUFFER_LIMIT, dropping oldest first", () => {
    for (let i = 0; i < TELEMETRY_BUFFER_LIMIT + 10; i++) {
      captureError(new Error(`e${i}`));
    }
    const buf = getTelemetryBuffer();
    expect(buf).toHaveLength(TELEMETRY_BUFFER_LIMIT);
    expect(buf[0]?.message).toBe("e10"); // first 10 evicted
    expect(buf[buf.length - 1]?.message).toBe(`e${TELEMETRY_BUFFER_LIMIT + 9}`);
  });

  it("getTelemetryBuffer returns a snapshot, not a live reference", () => {
    captureError(new Error("one"));
    const snap = getTelemetryBuffer();
    captureError(new Error("two"));
    expect(snap).toHaveLength(1);
  });

  it("clearTelemetryBuffer empties the buffer", () => {
    captureError(new Error("x"));
    clearTelemetryBuffer();
    expect(getTelemetryBuffer()).toHaveLength(0);
  });
});

describe("global error handlers", () => {
  // A plain EventTarget stands in for `window` — handlers are structural
  // over EventTarget, so this exercises the real wiring without a DOM.
  let target: EventTarget;

  beforeEach(() => {
    clearTelemetryBuffer();
    target = new EventTarget();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    uninstallGlobalErrorHandlers(target);
    vi.restoreAllMocks();
    clearTelemetryBuffer();
  });

  it("captures error events dispatched on the target", () => {
    installGlobalErrorHandlers(target);
    const err = new Error("global boom");
    target.dispatchEvent(
      Object.assign(new Event("error"), { error: err, message: "global boom", filename: "app.js", lineno: 1, colno: 2 })
    );
    const buf = getTelemetryBuffer();
    expect(buf.some((e) => e.message === "global boom")).toBe(true);
  });

  it("captures unhandledrejection events", () => {
    installGlobalErrorHandlers(target);
    target.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: new Error("rejected") }));
    const buf = getTelemetryBuffer();
    expect(buf.some((e) => e.message === "rejected")).toBe(true);
  });

  it("uninstall stops further captures", () => {
    const uninstall = installGlobalErrorHandlers(target);
    uninstall();
    target.dispatchEvent(Object.assign(new Event("error"), { error: new Error("after uninstall") }));
    expect(getTelemetryBuffer()).toHaveLength(0);
  });
});
