/**
 * The first-run walkthrough, as data.
 *
 * Steps point at real controls via `data-tour` attributes rather than hard-coded
 * coordinates, so the tour follows the UI when it moves. Any step whose target isn't on
 * screen is skipped rather than pointing at nothing — the AI panel is feature-flagged
 * and the toolbar collapses on narrow windows, so a missing target is a normal state,
 * not a bug.
 */

export interface TourStep {
  id: string;
  /** `data-tour` value of the element to highlight. Omit for a centred intro card. */
  target?: string;
  title: string;
  body: string;
  /** Preferred side to place the card on; it flips if there isn't room. */
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Marina Studio',
    body: 'Arrange furniture in a 3D room and see how real sunlight moves through it across the day — before you buy anything. This takes about a minute.',
  },
  {
    id: 'modes',
    target: 'mode-toggle',
    title: 'Two ways to work',
    body: '3D is for looking around and placing furniture. Plan is a top-down floor plan for drawing walls, windows and doors. Keys 1 and 2 switch between them.',
    side: 'bottom',
  },
  {
    id: 'catalog',
    target: 'catalog',
    title: 'Add furniture',
    body: 'Click any item to drop it into the room — it lands in the first free spot rather than on top of something else. Drag to move, R to rotate, Delete to remove.',
    side: 'right',
  },
  {
    id: 'location',
    target: 'light',
    title: 'Put the room on the map',
    body: 'Open Light, then “Choose on map” to find your actual building on satellite imagery and turn the room to face the way it really faces. Sunlight is then computed from the real sun for that spot and date.',
    side: 'bottom',
  },
  {
    id: 'realism',
    target: 'realism',
    title: 'Realism',
    body: 'Switches on photographic materials, soft shadows, ambient occlusion and window light. Quality adapts to your machine automatically, so this stays smooth.',
    side: 'bottom',
  },
  {
    id: 'day',
    target: 'day',
    title: 'Watch a whole day — then re-light it',
    body: 'Renders one frame per hour and lets you scrub through the day, every frame at the real sun position for your location. With an OpenAI key, any single hour can then be restyled into another mood — dawn, golden hour, dusk — by an image model.',
    side: 'bottom',
  },
  {
    id: 'ai',
    target: 'ai-panel',
    title: 'AI assistant',
    body: 'Ask for a layout and a deterministic solver places it — the model proposes intent, never raw coordinates. With an OpenAI key it can also re-light a frame photorealistically.',
    side: 'left',
  },
  {
    id: 'capture',
    target: 'capture',
    title: 'Take a picture',
    body: 'A one-shot high-quality render with depth of field, at maximum settings. Good for sharing a design or comparing options side by side.',
    side: 'bottom',
  },
];

const SEEN_KEY = 'interior:tourSeen';

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    // Private browsing or a blocked storage partition — better to show the tour again
    // than to crash on a storage read.
    return false;
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* nothing to do — the tour just shows again next time */
  }
}

/** Steps whose target is currently on screen (plus targetless intro/outro steps). */
export function visibleSteps(steps: TourStep[], isPresent: (target: string) => boolean): TourStep[] {
  return steps.filter((s) => !s.target || isPresent(s.target));
}

export interface Placement {
  top: number;
  left: number;
  side: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * Place the tour card next to its target, flipping to the opposite side when it would
 * overflow and clamping so it always stays fully on screen.
 */
export function placeCard(
  rect: { top: number; left: number; width: number; height: number },
  card: { width: number; height: number },
  viewport: { width: number; height: number },
  preferred: 'top' | 'bottom' | 'left' | 'right' = 'bottom',
  gap = 12,
): Placement {
  const fits = {
    bottom: rect.top + rect.height + gap + card.height <= viewport.height,
    top: rect.top - gap - card.height >= 0,
    right: rect.left + rect.width + gap + card.width <= viewport.width,
    left: rect.left - gap - card.width >= 0,
  };
  const order: Placement['side'][] = [preferred, 'bottom', 'top', 'right', 'left'];
  const side = order.find((s) => fits[s]) ?? preferred;

  let top: number;
  let left: number;
  if (side === 'bottom' || side === 'top') {
    top = side === 'bottom' ? rect.top + rect.height + gap : rect.top - gap - card.height;
    left = rect.left + rect.width / 2 - card.width / 2;
  } else {
    left = side === 'right' ? rect.left + rect.width + gap : rect.left - gap - card.width;
    top = rect.top + rect.height / 2 - card.height / 2;
  }

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return {
    side,
    top: clamp(top, gap, Math.max(gap, viewport.height - card.height - gap)),
    left: clamp(left, gap, Math.max(gap, viewport.width - card.width - gap)),
  };
}
