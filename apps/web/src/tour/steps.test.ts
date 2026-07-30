import { describe, expect, it } from 'vitest';
import { placeCard, TOUR_STEPS, visibleSteps, type TourStep } from './steps';

const VIEWPORT = { width: 1280, height: 800 };
const CARD = { width: 300, height: 160 };

describe('TOUR_STEPS', () => {
  it('opens with a targetless intro so the tour starts centred', () => {
    expect(TOUR_STEPS[0]!.target).toBeUndefined();
  });

  it('has unique ids', () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every step something to say', () => {
    for (const s of TOUR_STEPS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(20);
    }
  });
});

describe('visibleSteps', () => {
  const steps: TourStep[] = [
    { id: 'intro', title: 'a', body: 'x'.repeat(30) },
    { id: 'ai', target: 'ai-panel', title: 'b', body: 'x'.repeat(30) },
    { id: 'cap', target: 'capture', title: 'c', body: 'x'.repeat(30) },
  ];

  it('drops steps whose target is not on screen', () => {
    // The AI panel is feature-flagged off in plenty of setups — pointing at nothing
    // would be worse than skipping it.
    const out = visibleSteps(steps, (t) => t !== 'ai-panel');
    expect(out.map((s) => s.id)).toEqual(['intro', 'cap']);
  });

  it('always keeps targetless steps', () => {
    expect(visibleSteps(steps, () => false).map((s) => s.id)).toEqual(['intro']);
  });

  it('keeps everything when all targets are present', () => {
    expect(visibleSteps(steps, () => true)).toHaveLength(3);
  });
});

describe('placeCard', () => {
  const target = { top: 300, left: 500, width: 120, height: 40 };

  it('honours the preferred side when there is room', () => {
    expect(placeCard(target, CARD, VIEWPORT, 'bottom').side).toBe('bottom');
    expect(placeCard(target, CARD, VIEWPORT, 'right').side).toBe('right');
  });

  it('centres the card on the target along the shared axis', () => {
    const p = placeCard(target, CARD, VIEWPORT, 'bottom');
    expect(p.left).toBeCloseTo(500 + 60 - 150, 5);
    expect(p.top).toBeCloseTo(300 + 40 + 12, 5);
  });

  it('flips away from a side with no room', () => {
    // Target hard against the bottom edge: 'bottom' cannot fit.
    const low = { top: 780, left: 500, width: 120, height: 40 };
    expect(placeCard(low, CARD, VIEWPORT, 'bottom').side).not.toBe('bottom');
  });

  it('never places the card off screen, even for a corner target', () => {
    for (const t of [
      { top: 0, left: 0, width: 40, height: 40 },
      { top: 760, left: 1240, width: 40, height: 40 },
      { top: 0, left: 1240, width: 40, height: 40 },
      { top: 760, left: 0, width: 40, height: 40 },
    ]) {
      for (const side of ['top', 'bottom', 'left', 'right'] as const) {
        const p = placeCard(t, CARD, VIEWPORT, side);
        expect(p.left).toBeGreaterThanOrEqual(0);
        expect(p.top).toBeGreaterThanOrEqual(0);
        expect(p.left + CARD.width).toBeLessThanOrEqual(VIEWPORT.width);
        expect(p.top + CARD.height).toBeLessThanOrEqual(VIEWPORT.height);
      }
    }
  });

  it('stays on screen when the card barely fits the viewport at all', () => {
    const tiny = { width: 320, height: 200 };
    const p = placeCard({ top: 100, left: 100, width: 50, height: 50 }, CARD, tiny, 'bottom');
    expect(p.top).toBeGreaterThanOrEqual(0);
    expect(p.left).toBeGreaterThanOrEqual(0);
  });
});
