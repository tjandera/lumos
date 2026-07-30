import type { Quality } from './uiStore';

/**
 * Picking a starting quality from what the device actually is, rather than starting
 * everything at maximum and waiting for the fps governor to notice.
 *
 * The governor (qualityAdaptation.ts) is reactive: it only steps down once frames are
 * already being dropped. That misses the case this exists for — a machine that holds
 * 120fps comfortably *while pinning its GPU and spinning its fans*. Frame rate says
 * everything is fine; the laptop says otherwise. So the opening guess comes from
 * hardware signals, and the governor refines from there.
 */

export interface DeviceSignals {
  /** `navigator.hardwareConcurrency`, or undefined where unavailable. */
  cores?: number;
  /** `navigator.deviceMemory` in GB (Chromium only). */
  memoryGb?: number;
  /** `window.devicePixelRatio`. */
  pixelRatio: number;
  /** Viewport area in CSS pixels — a 4K display is far more work than a laptop pane. */
  viewportArea: number;
  /** Coarse pointer / small screen — treat as mobile regardless of what the GPU claims. */
  isMobile: boolean;
  /** `WEBGL_debug_renderer_info` UNMASKED_RENDERER_WEBGL, when the browser exposes it. */
  gpu?: string;
  /** User asked the OS to minimise animation; respect it as a strong "go easy" signal. */
  prefersReducedMotion?: boolean;
}

/** GPUs that are integrated / low-power. Substring match on the reported renderer. */
const LOW_POWER_GPU = /(intel|iris|uhd|hd graphics|mali|adreno|powervr|swiftshader|llvmpipe|apple gpu)/i;
/** Discrete or high-end integrated parts that can carry the full effect stack. */
const HIGH_POWER_GPU = /(nvidia|geforce|rtx|gtx|radeon|rx \d|apple m[1-9](\s|$)|max|ultra|pro)/i;

/**
 * Choose the quality tier this device should *start* at.
 *
 * Deliberately conservative: starting a tier too low costs a bit of fidelity for a few
 * seconds until the governor raises it, while starting too high means a burst of heat
 * and fan noise that the user hears before any of it can be corrected.
 */
export function initialQuality(s: DeviceSignals): Quality {
  if (s.isMobile) return 'low';
  if (s.prefersReducedMotion) return 'low';

  let score = 0;

  if (s.gpu && HIGH_POWER_GPU.test(s.gpu) && !LOW_POWER_GPU.test(s.gpu)) score += 2;
  else if (s.gpu && LOW_POWER_GPU.test(s.gpu)) score -= 1;

  if (s.cores !== undefined) {
    if (s.cores >= 12) score += 1;
    else if (s.cores <= 4) score -= 1;
  }
  if (s.memoryGb !== undefined && s.memoryGb <= 4) score -= 1;

  // Pixels are the thing being paid for every frame: a 2x display over a large viewport
  // is several times the fragment work of a 1x laptop pane at the same tier.
  const devicePixels = s.viewportArea * s.pixelRatio * s.pixelRatio;
  if (devicePixels > 6_000_000) score -= 1;
  if (devicePixels > 12_000_000) score -= 1;

  if (score >= 2) return 'high';
  if (score >= 0) return 'med';
  return 'low';
}

/**
 * Cap on `devicePixelRatio`.
 *
 * Rendering at a Retina display's native 2x means four times the fragments for a
 * difference most people can't see on a 3D interior — and it's the single cheapest
 * knob for heat. 1.5 keeps edges clean while cutting fragment work roughly in half
 * versus 2.
 */
export function maxPixelRatio(quality: Quality, devicePixelRatio: number): number {
  const cap = quality === 'high' ? 2 : quality === 'med' ? 1.5 : 1;
  return Math.min(devicePixelRatio, cap);
}

/**
 * `powerPreference` for the WebGL context.
 *
 * Asking for 'high-performance' unconditionally forces the discrete GPU on dual-GPU
 * laptops, which is exactly the "fans immediately" behaviour — and for a room with a
 * few dozen objects it buys very little. Only the top tier asks for it.
 */
export function powerPreference(quality: Quality): 'default' | 'high-performance' | 'low-power' {
  if (quality === 'high') return 'high-performance';
  if (quality === 'low') return 'low-power';
  return 'default';
}

/** How many frames the contact-shadow pass should re-render after something changes.
 *  `Infinity` (the old value) re-renders a whole extra pass every frame, forever. */
export function contactShadowFrames(quality: Quality): number {
  return quality === 'low' ? 1 : 2;
}

/** Read the signals available in this browser. Safe to call anywhere; returns
 *  conservative defaults when APIs are missing (headless, older browsers). */
export function readDeviceSignals(): DeviceSignals {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { pixelRatio: 1, viewportArea: 1_000_000, isMobile: false };
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const small = Math.min(window.innerWidth, window.innerHeight) < 640;
  return {
    cores: nav.hardwareConcurrency,
    memoryGb: nav.deviceMemory,
    pixelRatio: window.devicePixelRatio || 1,
    viewportArea: Math.max(1, window.innerWidth * window.innerHeight),
    isMobile: coarse && small,
    gpu: readGpuName(),
    prefersReducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  };
}

/** Best-effort GPU name. Many browsers mask this for fingerprinting reasons, which is
 *  fine — the other signals still carry the decision. */
function readGpuName(): string | undefined {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return undefined;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return undefined;
    const name = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    return typeof name === 'string' ? name : undefined;
  } catch {
    return undefined;
  }
}
