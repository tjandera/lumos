/**
 * Reusable collapsible section used to progressively disclose secondary
 * controls (e.g. an "Advanced" group in a settings panel). Uncontrolled by
 * default (own open/closed state); pass `defaultOpen` to start expanded.
 *
 * Styling is intentionally plain/inline (matching the rest of the panels in
 * this app, which use inline styles rather than a CSS framework) so it drops
 * into LightingPanel/PropertiesPanel/CatalogPanel without extra setup.
 */

import { useId, useState, type ReactNode } from "react";

export function Collapsible({
  title,
  advanced = false,
  defaultOpen = false,
  children
}: {
  title: string;
  /** Marks this as an "Advanced" section — adds a subdued badge next to the title. */
  advanced?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <div style={{ marginBottom: 14, border: "1px solid #e2e2e2", borderRadius: 6 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={contentId}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "8px 10px",
          background: "#fafafa",
          border: "none",
          borderRadius: open ? "6px 6px 0 0" : 6,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          color: "#333",
          textAlign: "left"
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {title}
          {advanced && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                color: "#888",
                background: "#eee",
                borderRadius: 10,
                padding: "1px 6px"
              }}
            >
              Advanced
            </span>
          )}
        </span>
        <span aria-hidden style={{ color: "#888", fontSize: 11 }}>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div id={contentId} style={{ padding: 10 }}>
          {children}
        </div>
      )}
    </div>
  );
}
