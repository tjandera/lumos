/**
 * Pure touch-gesture math for the Plan editor's two-finger pinch
 * zoom + pan. Kept separate (no React/DOM) so it's unit-testable and so
 * `PlanEditor` only has to track pointer state and call these.
 */

export interface TouchPoint {
  x: number;
  y: number;
}

export interface Viewport2D {
  scale: number; // pixels per meter
  offsetX: number; // px
  offsetY: number; // px
}

/** Euclidean distance between two active touch points, in screen px. */
export function pinchDistance(a: TouchPoint, b: TouchPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Midpoint between two active touch points, in screen px. */
export function pinchMidpoint(a: TouchPoint, b: TouchPoint): TouchPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Given the viewport as of the previous pinch sample (`prevDistance` /
 * `prevCenter` between the two touches at that time) and the current
 * distance/center, returns the next viewport: zoom scaled by how much the
 * fingers spread/pinched, panned so the same world point that was under the
 * previous midpoint stays under the current midpoint (so zoom tracks the
 * pinch gesture instead of jumping/recentering), scale clamped to
 * [minScale, maxScale].
 */
export function computePinchZoom(
  prevViewport: Viewport2D,
  prevDistance: number,
  prevCenter: TouchPoint,
  currDistance: number,
  currCenter: TouchPoint,
  minScale = 10,
  maxScale = 400
): Viewport2D {
  if (prevDistance <= 0 || prevViewport.scale <= 0) {
    return { scale: prevViewport.scale, offsetX: prevViewport.offsetX, offsetY: prevViewport.offsetY };
  }

  const rawScale = prevViewport.scale * (currDistance / prevDistance);
  const nextScale = Math.min(maxScale, Math.max(minScale, rawScale));

  const worldX = (prevCenter.x - prevViewport.offsetX) / prevViewport.scale;
  const worldY = (prevCenter.y - prevViewport.offsetY) / prevViewport.scale;

  return {
    scale: nextScale,
    offsetX: currCenter.x - worldX * nextScale,
    offsetY: currCenter.y - worldY * nextScale
  };
}
