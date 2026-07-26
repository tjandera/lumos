/**
 * "Open design" dialog: lists design summaries from `GET /designs` with
 * open + delete actions. Purely a view over `designStore` — no API calls of
 * its own beyond what the store already exposes.
 */
import { useEffect, useState } from "react";
import { useDesignStore } from "../store/designStore";

export interface DesignsModalProps {
  onClose: () => void;
  /** Called after a design is successfully opened, so the caller can close the modal / switch tabs. */
  onOpened?: (id: string) => void;
}

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function DesignsModal({ onClose, onOpened }: DesignsModalProps) {
  const designs = useDesignStore((s) => s.designs);
  const loading = useDesignStore((s) => s.designsLoading);
  const error = useDesignStore((s) => s.designsError);
  const refreshDesigns = useDesignStore((s) => s.refreshDesigns);
  const open = useDesignStore((s) => s.open);
  const removeDesign = useDesignStore((s) => s.removeDesign);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void refreshDesigns();
  }, [refreshDesigns]);

  async function handleOpen(id: string) {
    setBusyId(id);
    const ok = await open(id);
    setBusyId(null);
    if (ok) {
      onOpened?.(id);
      onClose();
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;
    setBusyId(id);
    await removeDesign(id);
    setBusyId(null);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Open design"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        fontFamily: "sans-serif"
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 8,
          width: 420,
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 30px rgba(0,0,0,0.25)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #eee" }}>
          <h3 style={{ margin: 0, flex: 1 }}>Open design</h3>
          <button onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: 8, flex: 1 }}>
          {loading && <p style={{ color: "#888", padding: 8 }}>Loading designs…</p>}
          {!loading && error && (
            <p style={{ color: "#b3261e", padding: 8 }}>
              Couldn't load designs: {error}. <button onClick={() => void refreshDesigns()}>Retry</button>
            </p>
          )}
          {!loading && !error && designs.length === 0 && (
            <p style={{ color: "#888", padding: 8 }}>No saved designs yet.</p>
          )}
          {!loading &&
            designs.map((d) => (
              <div
                key={d.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 6,
                  marginBottom: 4,
                  background: "#fafafa",
                  border: "1px solid #eee"
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {d.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#999" }}>Updated {formatUpdatedAt(d.updatedAt)}</div>
                </div>
                <button disabled={busyId === d.id} onClick={() => void handleOpen(d.id)}>
                  Open
                </button>
                <button disabled={busyId === d.id} onClick={() => void handleDelete(d.id, d.name)} style={{ color: "#b3261e" }}>
                  Delete
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
