/**
 * Pure fetch/error-normalization logic for the share viewer, split out of
 * `ShareViewer.tsx` so it's unit-testable without mounting a react-three-fiber
 * `Canvas` (jsdom/vitest has no WebGL). Any failure — invalid token, revoked
 * token, network error, whatever — collapses to the same friendly message:
 * a share viewer shouldn't leak API error internals to a stranger.
 */
import type { SceneDocument } from "@interior/core";
import { getSharedDesign } from "../api/client";

export const SHARE_LINK_INVALID_MESSAGE = "This link is invalid or was revoked.";

export type ShareLoadResult = { ok: true; document: SceneDocument } | { ok: false; message: string };

export async function loadSharedDesign(token: string): Promise<ShareLoadResult> {
  try {
    const document = await getSharedDesign(token);
    return { ok: true, document };
  } catch {
    return { ok: false, message: SHARE_LINK_INVALID_MESSAGE };
  }
}
