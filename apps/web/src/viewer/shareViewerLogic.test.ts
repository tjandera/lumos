import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSharedDesign, SHARE_LINK_INVALID_MESSAGE } from "./shareViewerLogic";

const originalFetch = global.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("loadSharedDesign", () => {
  it("returns ok:true with the document on success", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ meta: { id: "id-1", name: "Cozy Loft", createdAt: "t", updatedAt: "t" }, rooms: [], furniture: [], lights: [] })
      ) as unknown as typeof fetch;

    const result = await loadSharedDesign("tok-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.meta.name).toBe("Cozy Loft");
    }
  });

  it("collapses a 404 (invalid/revoked token) to the friendly message", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: "gone" }, 404)) as unknown as typeof fetch;

    const result = await loadSharedDesign("dead-token");

    expect(result).toEqual({ ok: false, message: SHARE_LINK_INVALID_MESSAGE });
  });

  it("collapses a network failure to the same friendly message (no internals leaked)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;

    const result = await loadSharedDesign("tok-1");

    expect(result).toEqual({ ok: false, message: SHARE_LINK_INVALID_MESSAGE });
  });

  it("collapses a 500 (server error) to the same friendly message", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: "boom" }, 500)) as unknown as typeof fetch;

    const result = await loadSharedDesign("tok-1");

    expect(result).toEqual({ ok: false, message: SHARE_LINK_INVALID_MESSAGE });
  });
});
