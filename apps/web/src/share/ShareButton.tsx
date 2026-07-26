/**
 * "Share" control for the design toolbar. Only rendered for a saved design
 * (needs a server-assigned id — see `App.tsx`'s `DesignToolbar`, which passes
 * `designId={null}` for a never-saved design and this component no-ops).
 * Creating a link calls the owner-only `POST /designs/:id/share`; the
 * resulting token is turned into a hash-routed URL (`buildShareUrl`) that
 * `main.tsx` recognizes and renders via `ShareViewer` — no server round trip
 * needed to know the URL shape.
 */
import { useEffect, useState } from "react";
import { createShareLink, revokeShareLink } from "../api/client";
import { buildShareUrl } from "./hashRoute";

export interface ShareButtonProps {
  /** The current design's server-assigned id, or `null` if never saved. */
  designId: string | null;
}

export function ShareButton({ designId }: ShareButtonProps) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Switching to a different design (or an unsaved one) invalidates any link
  // shown for the previous one — this component's local state isn't scoped
  // per-design, so it must reset itself.
  useEffect(() => {
    setToken(null);
    setError(null);
    setCopied(false);
  }, [designId]);

  if (!designId) return null;

  const shareUrl = token ? buildShareUrl(window.location.origin, token) : null;

  async function handleShare() {
    setLoading(true);
    setError(null);
    try {
      const info = await createShareLink(designId!);
      setToken(info.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create share link");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke() {
    setLoading(true);
    setError(null);
    try {
      await revokeShareLink(designId!);
      setToken(null);
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke share link");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be unavailable (permissions/older browser) — the
      // URL is still shown in a selectable input for manual copy.
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {!shareUrl ? (
        <button onClick={() => void handleShare()} disabled={loading}>
          {loading ? "Sharing…" : "Share"}
        </button>
      ) : (
        <>
          <input
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Share link"
            style={{ width: 220, fontSize: 11, padding: "3px 4px" }}
          />
          <button onClick={() => void handleCopy()} title="Copy link">
            {copied ? "Copied" : "Copy"}
          </button>
          <button onClick={() => void handleRevoke()} disabled={loading} title="Revoke this link">
            Revoke
          </button>
        </>
      )}
      {error && (
        <span style={{ fontSize: 11, color: "#b3261e" }} title={error}>
          {error}
        </span>
      )}
    </div>
  );
}
