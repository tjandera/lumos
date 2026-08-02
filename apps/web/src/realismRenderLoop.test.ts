import { describe, expect, it } from 'vitest';

/**
 * The render-ownership rule that made the Realism view glitch.
 *
 * React Three Fiber's loop contains exactly this line:
 *
 *   if (!state.internal.priority && state.gl.render) state.gl.render(state.scene, state.camera);
 *
 * `internal.priority` counts `useFrame` subscribers registered with a priority above
 * zero. So the instant `PostEffects` subscribes at priority 1, R3F stops drawing and the
 * effect composer becomes the only thing that paints.
 *
 * That is fine while a composer exists. It is not fine in the two states where one
 * doesn't: mid-rebuild (which the adaptive quality governor triggers by itself during
 * normal use) and permanently, when construction threw on an unfriendly driver. The old
 * callback was `composerRef.current?.render(delta)` — an optional call that silently did
 * nothing, while still holding the render loop hostage. The canvas went black or froze.
 *
 * These tests model the loop rather than the component, because the failure is in who
 * owns the frame, not in any three.js behaviour — and modelling it keeps the rule pinned
 * even if the component is restructured later.
 */

/** The relevant slice of R3F's frame loop. */
function r3fFrame(opts: {
  /** Count of useFrame subscribers with priority > 0. */
  priority: number;
  /** The priority-1 callback, if one is subscribed. */
  subscriber?: () => void;
  onR3fRender: () => void;
}) {
  opts.subscriber?.();
  if (!opts.priority) opts.onR3fRender();
}

/** The frame callback as it is written now: composer, or a plain render as fallback. */
function postEffectsFrame(composer: { render(): void } | null, glRender: () => void) {
  if (composer) composer.render();
  else glRender();
}

describe('who paints the canvas', () => {
  it('R3F stops rendering as soon as a priority subscriber exists', () => {
    let r3fRendered = 0;
    r3fFrame({ priority: 1, subscriber: () => {}, onR3fRender: () => r3fRendered++ });
    expect(r3fRendered).toBe(0);
  });

  it('R3F does render when nothing has claimed priority', () => {
    let r3fRendered = 0;
    r3fFrame({ priority: 0, onR3fRender: () => r3fRendered++ });
    expect(r3fRendered).toBe(1);
  });

  it('paints through the composer when there is one', () => {
    let composerRenders = 0;
    let plainRenders = 0;
    postEffectsFrame({ render: () => composerRenders++ }, () => plainRenders++);
    expect([composerRenders, plainRenders]).toEqual([1, 0]);
  });

  it('still paints when the composer is missing — the actual fix', () => {
    // Previously `composerRef.current?.render()` drew nothing here, and because R3F had
    // already stood down, the frame was simply lost.
    let plainRenders = 0;
    postEffectsFrame(null, () => plainRenders++);
    expect(plainRenders).toBe(1);
  });

  it('never drops a frame across a composer rebuild', () => {
    // A quality change disposes the old composer and builds a new one. The governor does
    // this on its own mid-session, so the gap has to be survivable rather than rare.
    let painted = 0;
    const paint = (composer: { render(): void } | null) =>
      postEffectsFrame(composer, () => painted++);
    const composer = { render: () => painted++ };

    paint(composer); // steady state
    paint(null); // torn down
    paint(null); // still rebuilding
    paint({ render: () => painted++ }); // new composer live

    expect(painted).toBe(4);
  });

  it('keeps painting forever when construction failed outright', () => {
    // The try/catch leaves composerRef null permanently on a driver that rejects a pass.
    // Every subsequent frame must still reach the screen, un-post-processed.
    let painted = 0;
    for (let i = 0; i < 120; i++) postEffectsFrame(null, () => painted++);
    expect(painted).toBe(120);
  });
});

/**
 * Which quality transitions require a new pass chain.
 *
 * Keeping this honest matters because the composer was keyed on `quality` wholesale,
 * which meant low <-> medium — identical effects, different MSAA — paid for a full
 * teardown. That is the governor's most frequent move.
 */
const wantsSsao = (q: 'low' | 'medium' | 'high') => q === 'high';
const multisampling = (q: 'low' | 'medium' | 'high') => (q === 'low' ? 0 : 4);
const needsRebuild = (from: 'low' | 'medium' | 'high', to: 'low' | 'medium' | 'high') =>
  wantsSsao(from) !== wantsSsao(to);

describe('composer rebuild scope', () => {
  it('does not rebuild between low and medium — only the sample count differs', () => {
    expect(needsRebuild('low', 'medium')).toBe(false);
    expect(needsRebuild('medium', 'low')).toBe(false);
    expect(multisampling('low')).not.toBe(multisampling('medium'));
  });

  it('does rebuild when SSAO comes or goes', () => {
    expect(needsRebuild('medium', 'high')).toBe(true);
    expect(needsRebuild('high', 'medium')).toBe(true);
    expect(needsRebuild('low', 'high')).toBe(true);
  });

  it('never rebuilds for a no-op change', () => {
    for (const q of ['low', 'medium', 'high'] as const) expect(needsRebuild(q, q)).toBe(false);
  });
});
