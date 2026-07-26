import { useSyncExternalStore } from "react";
import { isContextLost, subscribeContextLoss } from "./contextLossStore";

/** Non-blocking banner shown while the WebGL context is lost and the
 *  browser/driver is (hopefully) about to restore it. Pure DOM overlay,
 *  sits above the Canvas without unmounting it. */
export function ContextLossOverlay() {
  const lost = useSyncExternalStore(subscribeContextLoss, isContextLost, isContextLost);
  if (!lost) return null;

  return (
    <div
      data-testid="context-loss-overlay"
      role="status"
      style={{
        position: "absolute",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 30,
        background: "rgba(30,10,10,0.9)",
        color: "#ffe1e1",
        padding: "8px 16px",
        borderRadius: 6,
        fontFamily: "sans-serif",
        fontSize: 13,
        pointerEvents: "none"
      }}
    >
      3D view paused — recovering…
    </div>
  );
}
