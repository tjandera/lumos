import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  checkHealth,
  createDesign,
  createShareLink,
  deleteDesign,
  getCatalog,
  getCatalogItem,
  getDesign,
  getSharedDesign,
  isNetworkError,
  listDesigns,
  revokeShareLink,
  saveDesign
} from "./client";

const originalFetch = global.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("request() error handling", () => {
  it("throws ApiError with the server's error message on a JSON error body", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: "Catalog item not found" }, 404)) as unknown as typeof fetch;

    await expect(getCatalogItem("nope")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      message: "Catalog item not found"
    });
  });

  it("falls back to a generic message when the error body isn't JSON", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("<html>502</html>", { status: 502 })) as unknown as typeof fetch;

    await expect(getCatalog()).rejects.toThrow(/failed with status 502/);
  });

  it("propagates a network failure (fetch throws) rather than swallowing it", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;

    await expect(listDesigns()).rejects.toThrow("Failed to fetch");
  });

  it("returns undefined for a 204 No Content response (delete)", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 })) as unknown as typeof fetch;
    await expect(deleteDesign("id-1")).resolves.toBeUndefined();
  });
});

describe("isNetworkError", () => {
  it("is false for ApiError (server reachable, HTTP error)", () => {
    expect(isNetworkError(new ApiError(404, "not found"))).toBe(false);
  });

  it("is true for any other thrown value (fetch/network failure)", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError("boom")).toBe(true);
  });
});

describe("checkHealth", () => {
  it("resolves true when the request succeeds, even with a non-2xx status", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 500 })) as unknown as typeof fetch;
    await expect(checkHealth()).resolves.toBe(true);
  });

  it("resolves false when the request throws (API unreachable)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;
    await expect(checkHealth()).resolves.toBe(false);
  });

  it("never throws", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("anything")) as unknown as typeof fetch;
    await expect(checkHealth()).resolves.not.toThrow();
  });
});

describe("request bodies / methods", () => {
  it("createDesign POSTs JSON and returns the parsed document", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ meta: { id: "x", name: "N", createdAt: "t", updatedAt: "t" }, rooms: [], furniture: [], lights: [] }, 201)
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const doc = await createDesign({ name: "N" });

    expect(doc.meta.id).toBe("x");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({ name: "N" });
  });

  it("saveDesign PUTs to /designs/:id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ meta: { id: "id-1", name: "N", createdAt: "t", updatedAt: "t" }, rooms: [], furniture: [], lights: [] })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await saveDesign("id-1", { meta: { id: "id-1", name: "N", createdAt: "t", updatedAt: "t" }, rooms: [], furniture: [], lights: [] });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/designs/id-1");
    expect(init.method).toBe("PUT");
  });

  it("getDesign fetches /designs/:id and returns the document unwrapped", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ meta: { id: "id-9", name: "N", createdAt: "t", updatedAt: "t" }, rooms: [], furniture: [], lights: [] })) as unknown as typeof fetch;

    const doc = await getDesign("id-9");
    expect(doc.meta.id).toBe("id-9");
  });

  it("every request sends credentials: include (so the session cookie flows cross-origin)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await getCatalog();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe("include");
  });
});

describe("share links", () => {
  it("createShareLink POSTs to /designs/:id/share and returns the token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ token: "tok-abc" }, 201));
    global.fetch = fetchMock as unknown as typeof fetch;

    const info = await createShareLink("design-1");

    expect(info.token).toBe("tok-abc");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/designs/design-1/share");
    expect(init.method).toBe("POST");
  });

  it("revokeShareLink DELETEs /designs/:id/share", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await revokeShareLink("design-1");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/designs/design-1/share");
    expect(init.method).toBe("DELETE");
  });

  it("getSharedDesign fetches /share/:token and returns the document unwrapped", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ meta: { id: "id-9", name: "Shared", createdAt: "t", updatedAt: "t" }, rooms: [], furniture: [], lights: [] })
      ) as unknown as typeof fetch;

    const doc = await getSharedDesign("tok-xyz");
    expect(doc.meta.name).toBe("Shared");
  });

  it("getSharedDesign propagates a 404 ApiError for an invalid/revoked token", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "This link is invalid or was revoked." }, 404)) as unknown as typeof fetch;

    await expect(getSharedDesign("dead-token")).rejects.toMatchObject({ status: 404 });
  });
});
