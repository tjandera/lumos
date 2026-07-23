/**
 * Tiny hash-routing helpers for the one alternate destination the app has: a
 * read-only share link at `#/share/:token`. No routing library needed for a
 * single route — see `main.tsx` for how this is resolved once at boot.
 */

const SHARE_HASH_PREFIX = "#/share/";

/**
 * Parse a `#/share/:token` hash into its token, or `null` if the hash isn't
 * a share link (empty, a different route, or a share hash with no token).
 */
export function parseShareToken(hash: string): string | null {
  if (!hash.startsWith(SHARE_HASH_PREFIX)) return null;
  const token = hash.slice(SHARE_HASH_PREFIX.length);
  if (token.length === 0) return null;
  try {
    return decodeURIComponent(token);
  } catch {
    return token;
  }
}

/** Build a full, shareable `#/share/:token` URL from an origin (e.g. `window.location.origin`). */
export function buildShareUrl(origin: string, token: string): string {
  return `${origin}/${SHARE_HASH_PREFIX}${encodeURIComponent(token)}`;
}
