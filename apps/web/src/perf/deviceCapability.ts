/**
 * Crude, synchronous device-capability detection used to pick an initial
 * lighting-quality preset before the user has expressed a preference.
 *
 * `detectDeviceSignals` is the only impure bit (touches `window`/`navigator`/
 * a throwaway canvas) — it's a thin wrapper so `pickInitialQuality` and
 * `classifyRendererTier` stay pure and unit-testable without a DOM.
 */

import type { QualityLevel } from "@interior/renderer";

export interface DeviceSignals {
  devicePixelRatio: number;
  maxTouchPoints: number;
  isMobileUA: boolean;
  /** `UNMASKED_RENDERER_WEBGL` string, or null if unavailable/blocked. */
  rendererString: string | null;
  hardwareConcurrency: number | null;
}

export type RendererTier = "low" | "mid" | "high" | "unknown";

/** Heuristic classification of a WebGL renderer string into a rough perf tier. */
export function classifyRendererTier(rendererString: string | null): RendererTier {
  if (!rendererString) return "unknown";
  const s = rendererString.toLowerCase();
  if (/swiftshader|llvmpipe|software|microsoft basic render|angle \(software/.test(s)) return "low";
  if (/adreno|mali-|powervr|apple gpu/.test(s)) return "mid";
  if (/nvidia|geforce|quadro|rtx|gtx|radeon|apple m\d|intel iris|intel\(r\) uhd|intel(r) arc/.test(s)) return "high";
  return "unknown";
}

/**
 * Pure decision: given crude device signals, pick a starting quality preset.
 * Deliberately conservative — false negatives (picking "medium" on a capable
 * machine) are cheap; false positives (picking "high" on a weak machine) are
 * what the dynamic downgrade in `autoQuality.ts` exists to correct anyway.
 */
export function pickInitialQuality(signals: DeviceSignals): QualityLevel {
  const rendererTier = classifyRendererTier(signals.rendererString);
  if (rendererTier === "low") return "low";

  const looksMobile = signals.isMobileUA || signals.maxTouchPoints > 0;
  if (looksMobile) {
    if (signals.devicePixelRatio >= 3 || rendererTier === "mid") return "low";
    return "medium";
  }

  if (rendererTier === "high") return "high";
  if (signals.hardwareConcurrency != null && signals.hardwareConcurrency <= 4) return "medium";
  return "high";
}

/** Best-effort read of the WebGL unmasked renderer string via a throwaway canvas. */
function readRendererString(): string | null {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const value = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

/** Gathers the impure device signals from the current browser environment. */
export function detectDeviceSignals(): DeviceSignals {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  return {
    devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    isMobileUA: /android|iphone|ipad|ipod|mobile/i.test(nav?.userAgent ?? ""),
    rendererString: typeof document !== "undefined" ? readRendererString() : null,
    hardwareConcurrency: nav?.hardwareConcurrency ?? null
  };
}
