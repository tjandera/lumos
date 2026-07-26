/**
 * Pure, GL-free frame-time sampler. Fed frame deltas (seconds) from
 * `useFrame`; produces a rolling-average fps + worst-frame fps over a
 * sliding window. Kept separate from any React/Three wiring so it's
 * unit-testable without a GL context.
 */

export interface FrameSample {
  fps: number;
  worstFrameFps: number;
}

export class FrameSampler {
  private readonly windowSize: number;
  private deltas: number[] = [];

  constructor(windowSize = 60) {
    if (windowSize < 1) throw new Error("windowSize must be >= 1");
    this.windowSize = windowSize;
  }

  /** Record one frame's delta time in seconds (must be > 0). */
  push(deltaSeconds: number): void {
    if (!(deltaSeconds > 0)) return; // ignore zero/negative/NaN deltas
    this.deltas.push(deltaSeconds);
    if (this.deltas.length > this.windowSize) this.deltas.shift();
  }

  reset(): void {
    this.deltas = [];
  }

  /** Rolling-average fps + worst single-frame fps over the current window.
   *  Returns fps=0 when no samples have been recorded yet. */
  sample(): FrameSample {
    if (this.deltas.length === 0) return { fps: 0, worstFrameFps: 0 };
    const avgDelta = this.deltas.reduce((sum, d) => sum + d, 0) / this.deltas.length;
    const worstDelta = Math.max(...this.deltas);
    return {
      fps: 1 / avgDelta,
      worstFrameFps: 1 / worstDelta
    };
  }
}
