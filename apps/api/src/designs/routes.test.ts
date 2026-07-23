import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";
import { createEmptyDocument } from "@interior/core";
import { buildApp } from "../app.js";

/**
 * A tiny cookie-jar wrapper around `app.inject` so tests can simulate a
 * single browser session across multiple requests (the anonymous-ownership
 * session cookie set on the first response must be replayed on later
 * requests, exactly like a real browser would). Each call to `makeClient`
 * models one distinct "user" / cookie jar.
 */
function makeClient(app: FastifyInstance) {
  let cookie: string | undefined;
  return async function inject(opts: InjectOptions): Promise<LightMyRequestResponse> {
    const res = await app.inject({
      ...opts,
      headers: { ...(opts.headers ?? {}), ...(cookie ? { cookie } : {}) }
    });
    const setCookie = res.headers["set-cookie"];
    if (setCookie) {
      const raw = Array.isArray(setCookie) ? setCookie[0]! : setCookie;
      cookie = raw.split(";")[0];
    }
    return res;
  };
}

describe("designs routes", () => {
  let app: FastifyInstance;
  let dataDir: string;
  let client: ReturnType<typeof makeClient>;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), "interior-designs-test-"));
    app = await buildApp({ logger: false, dataDir, sessionSecret: "test-secret" });
    client = makeClient(app);
  });

  afterEach(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it("GET /designs starts empty", async () => {
    const res = await client({ method: "GET", url: "/designs" });
    expect(res.statusCode).toBe(200);
    expect(res.json().designs).toEqual([]);
  });

  it("POST /designs with just a name creates an empty design", async () => {
    const res = await client({ method: "POST", url: "/designs", payload: { name: "My Flat" } });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.meta.name).toBe("My Flat");
    expect(body.rooms).toEqual([]);
  });

  it("POST /designs with a full document round-trips through GET /designs/:id", async () => {
    const doc = createEmptyDocument("Round Trip");
    const createRes = await client({ method: "POST", url: "/designs", payload: doc });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json();

    const getRes = await client({ method: "GET", url: `/designs/${created.meta.id}` });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json()).toEqual(created);
  });

  it("POST /designs accepts a v1 (unversioned) document and stores it migrated to v2", async () => {
    // A document shaped the way the app saved before schema versioning: no
    // schemaVersion, no site, coarse location on the sun light (rad north offset).
    const v1Doc = {
      meta: { id: "legacy", name: "Legacy Flat", createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-02T00:00:00.000Z" },
      rooms: [],
      furniture: [],
      lights: [
        {
          type: "sun",
          id: "sun",
          date: "2024-06-21",
          time: "15:00",
          latitude: 40.7128,
          longitude: -74.006,
          northOffset: Math.PI / 2
        }
      ]
    };

    const createRes = await client({ method: "POST", url: "/designs", payload: v1Doc });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json();
    expect(created.schemaVersion).toBe(2);
    expect(created.site.lat).toBe(40.7128);
    expect(created.site.lng).toBe(-74.006);
    expect(created.site.trueNorthOffsetDeg).toBeCloseTo(90, 6);

    // GET returns the stored, migrated v2 document.
    const getRes = await client({ method: "GET", url: `/designs/${created.meta.id}` });
    expect(getRes.statusCode).toBe(200);
    const fetched = getRes.json();
    expect(fetched.schemaVersion).toBe(2);
    expect(fetched.site).toEqual({ lat: 40.7128, lng: -74.006, trueNorthOffsetDeg: created.site.trueNorthOffsetDeg });
  });

  it("POST /designs assigns a fresh id even if one is supplied", async () => {
    const doc = createEmptyDocument("Dup", "client-supplied-id");
    const res = await client({ method: "POST", url: "/designs", payload: doc });
    expect(res.json().meta.id).not.toBe("client-supplied-id");
  });

  it("POST /designs rejects a structurally invalid document", async () => {
    const res = await client({
      method: "POST",
      url: "/designs",
      payload: { meta: { id: "x", name: "bad" }, rooms: "not-an-array", furniture: [], lights: [] }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Invalid/);
  });

  it("GET /designs lists summaries after creation", async () => {
    await client({ method: "POST", url: "/designs", payload: { name: "A" } });
    await client({ method: "POST", url: "/designs", payload: { name: "B" } });

    const res = await client({ method: "GET", url: "/designs" });
    const designs = res.json().designs;
    expect(designs).toHaveLength(2);
    expect(designs[0]).toHaveProperty("id");
    expect(designs[0]).toHaveProperty("name");
    expect(designs[0]).toHaveProperty("updatedAt");
    expect(designs.map((d: { name: string }) => d.name).sort()).toEqual(["A", "B"]);
  });

  it("GET /designs/:id 404s for an unknown id", async () => {
    const res = await client({ method: "GET", url: "/designs/does-not-exist" });
    expect(res.statusCode).toBe(404);
  });

  it("PUT /designs/:id updates an existing design and bumps updatedAt", async () => {
    const createRes = await client({ method: "POST", url: "/designs", payload: { name: "Original" } });
    const created = createRes.json();

    await new Promise((resolve) => setTimeout(resolve, 2));

    const updatedDoc = { ...created, meta: { ...created.meta, name: "Renamed" } };
    const putRes = await client({ method: "PUT", url: `/designs/${created.meta.id}`, payload: updatedDoc });

    expect(putRes.statusCode).toBe(200);
    const body = putRes.json();
    expect(body.meta.name).toBe("Renamed");
    expect(body.meta.id).toBe(created.meta.id);
    expect(body.meta.updatedAt).not.toBe(created.meta.updatedAt);
  });

  it("PUT /designs/:id 404s for an unknown id", async () => {
    const doc = createEmptyDocument("Ghost", "ghost-id");
    const res = await client({ method: "PUT", url: "/designs/ghost-id", payload: doc });
    expect(res.statusCode).toBe(404);
  });

  it("PUT /designs/:id rejects a structurally invalid document", async () => {
    const createRes = await client({ method: "POST", url: "/designs", payload: { name: "Original" } });
    const created = createRes.json();

    const res = await client({
      method: "PUT",
      url: `/designs/${created.meta.id}`,
      payload: { meta: created.meta, rooms: [], furniture: [{ id: "bad" }], lights: [] }
    });
    expect(res.statusCode).toBe(400);
  });

  it("DELETE /designs/:id removes a design", async () => {
    const createRes = await client({ method: "POST", url: "/designs", payload: { name: "Temp" } });
    const created = createRes.json();

    const deleteRes = await client({ method: "DELETE", url: `/designs/${created.meta.id}` });
    expect(deleteRes.statusCode).toBe(204);

    const getRes = await client({ method: "GET", url: `/designs/${created.meta.id}` });
    expect(getRes.statusCode).toBe(404);
  });

  it("DELETE /designs/:id 404s for an unknown id", async () => {
    const res = await client({ method: "DELETE", url: "/designs/does-not-exist" });
    expect(res.statusCode).toBe(404);
  });

  describe("ownership", () => {
    it("issues a session cookie on the first request", async () => {
      const res = await client({ method: "GET", url: "/designs" });
      const setCookie = res.headers["set-cookie"];
      expect(setCookie).toBeDefined();
      const raw = Array.isArray(setCookie) ? setCookie[0]! : (setCookie as string);
      expect(raw).toMatch(/^interior_session=/);
      expect(raw).toMatch(/HttpOnly/i);
    });

    it("the owner can update their own design", async () => {
      const createRes = await client({ method: "POST", url: "/designs", payload: { name: "Owner's" } });
      const created = createRes.json();

      const putRes = await client({
        method: "PUT",
        url: `/designs/${created.meta.id}`,
        payload: { ...created, meta: { ...created.meta, name: "Renamed by owner" } }
      });
      expect(putRes.statusCode).toBe(200);
      expect(putRes.json().meta.name).toBe("Renamed by owner");
    });

    it("a stranger gets 403 updating someone else's design", async () => {
      const createRes = await client({ method: "POST", url: "/designs", payload: { name: "Owner's" } });
      const created = createRes.json();

      const stranger = makeClient(app);
      const putRes = await stranger({
        method: "PUT",
        url: `/designs/${created.meta.id}`,
        payload: { ...created, meta: { ...created.meta, name: "Hijacked" } }
      });
      expect(putRes.statusCode).toBe(403);
    });

    it("a stranger gets 403 deleting someone else's design", async () => {
      const createRes = await client({ method: "POST", url: "/designs", payload: { name: "Owner's" } });
      const created = createRes.json();

      const stranger = makeClient(app);
      const delRes = await stranger({ method: "DELETE", url: `/designs/${created.meta.id}` });
      expect(delRes.statusCode).toBe(403);

      // Untouched: the owner can still fetch it.
      const getRes = await client({ method: "GET", url: `/designs/${created.meta.id}` });
      expect(getRes.statusCode).toBe(200);
    });

    it("a stranger gets 403 reading someone else's design by id", async () => {
      const createRes = await client({ method: "POST", url: "/designs", payload: { name: "Owner's" } });
      const created = createRes.json();

      const stranger = makeClient(app);
      const getRes = await stranger({ method: "GET", url: `/designs/${created.meta.id}` });
      expect(getRes.statusCode).toBe(403);
    });

    it("GET /designs list scoping: each user only sees their own designs", async () => {
      await client({ method: "POST", url: "/designs", payload: { name: "Mine A" } });
      await client({ method: "POST", url: "/designs", payload: { name: "Mine B" } });

      const stranger = makeClient(app);
      await stranger({ method: "POST", url: "/designs", payload: { name: "Theirs" } });

      const mine = await client({ method: "GET", url: "/designs" });
      expect(mine.json().designs.map((d: { name: string }) => d.name).sort()).toEqual(["Mine A", "Mine B"]);

      const theirs = await stranger({ method: "GET", url: "/designs" });
      expect(theirs.json().designs.map((d: { name: string }) => d.name)).toEqual(["Theirs"]);
    });

    it("a legacy design with no recorded owner is claimable by the first PUT", async () => {
      // Simulate a pre-ownership design: written directly to storage, bypassing
      // the owned POST route, so no owners.json entry exists for it.
      const { FileDesignStorage } = await import("./fileStorage.js");
      const storage = new FileDesignStorage(dataDir);
      const legacy = createEmptyDocument("Legacy", "legacy-id");
      await storage.save(legacy);

      // Readable by anyone before it's claimed.
      const getRes = await client({ method: "GET", url: "/designs/legacy-id" });
      expect(getRes.statusCode).toBe(200);

      const claimer = makeClient(app);
      const putRes = await claimer({
        method: "PUT",
        url: "/designs/legacy-id",
        payload: { ...legacy, meta: { ...legacy.meta, name: "Claimed" } }
      });
      expect(putRes.statusCode).toBe(200);

      // Now that it's claimed, a different stranger is locked out.
      const stranger = makeClient(app);
      const strangerPut = await stranger({
        method: "PUT",
        url: "/designs/legacy-id",
        payload: { ...legacy, meta: { ...legacy.meta, name: "Hijacked" } }
      });
      expect(strangerPut.statusCode).toBe(403);
    });
  });

  describe("share links", () => {
    it("owner can create and revoke a share link", async () => {
      const createRes = await client({ method: "POST", url: "/designs", payload: { name: "Shareable" } });
      const created = createRes.json();

      const shareRes = await client({ method: "POST", url: `/designs/${created.meta.id}/share` });
      expect(shareRes.statusCode).toBe(201);
      const { token } = shareRes.json();
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(20);

      const publicRes = await app.inject({ method: "GET", url: `/share/${token}` });
      expect(publicRes.statusCode).toBe(200);
      expect(publicRes.json().meta.id).toBe(created.meta.id);

      const revokeRes = await client({ method: "DELETE", url: `/designs/${created.meta.id}/share` });
      expect(revokeRes.statusCode).toBe(204);

      const afterRevoke = await app.inject({ method: "GET", url: `/share/${token}` });
      expect(afterRevoke.statusCode).toBe(404);
    });

    it("a stranger cannot create a share link for someone else's design", async () => {
      const createRes = await client({ method: "POST", url: "/designs", payload: { name: "Private" } });
      const created = createRes.json();

      const stranger = makeClient(app);
      const shareRes = await stranger({ method: "POST", url: `/designs/${created.meta.id}/share` });
      expect(shareRes.statusCode).toBe(403);
    });

    it("creating a new share token invalidates the previous one", async () => {
      const createRes = await client({ method: "POST", url: "/designs", payload: { name: "Reshared" } });
      const created = createRes.json();

      const first = (await client({ method: "POST", url: `/designs/${created.meta.id}/share` })).json().token;
      const second = (await client({ method: "POST", url: `/designs/${created.meta.id}/share` })).json().token;
      expect(second).not.toBe(first);

      const oldRes = await app.inject({ method: "GET", url: `/share/${first}` });
      expect(oldRes.statusCode).toBe(404);

      const newRes = await app.inject({ method: "GET", url: `/share/${second}` });
      expect(newRes.statusCode).toBe(200);
    });
  });
});
