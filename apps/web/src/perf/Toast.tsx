import { useEffect, useSyncExternalStore } from "react";
import { clearToast, getToast, subscribeToast } from "./toastStore";

const AUTO_DISMISS_MS = 4000;

function useToast() {
  return useSyncExternalStore(subscribeToast, getToast, getToast);
}

/** Small bottom-center toast for one-line, self-dismissing notices. */
export function Toast() {
  const toast = useToast();

  useEffect(() => {
    if (!toast) return;
    const id = toast.id;
    const timer = window.setTimeout(() => clearToast(id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      data-testid="toast"
      role="status"
      style={{
        position: "absolute",
        left: "50%",
        bottom: 16,
        transform: "translateX(-50%)",
        zIndex: 40,
        background: "rgba(20,20,20,0.9)",
        color: "#fff",
        padding: "8px 14px",
        borderRadius: 8,
        fontFamily: "sans-serif",
        fontSize: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
        pointerEvents: "none",
        maxWidth: "80vw",
        textAlign: "center"
      }}
    >
      {toast.message}
    </div>
  );
}
