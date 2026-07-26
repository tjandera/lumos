import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

describe("share round-trip", () => {
  let app: FastifyInstance;
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), "interior-share-test-"));
    app = await buildApp({ logger: false, dataDir, sessionSecret: "test-secret" });
  });

  afterEach(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it("404s for a token that was never issued", async () => {
    const res = await app.inject({ method: "GET", url: "/share/not-a-real-token" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/invalid or was revoked/i);
  });

  it("create token -> fetch unauthenticated (no cookie at all) -> revoke -> 404", async () => {
    // Owner creates and shares a design (cookie jar for the create/share calls).
    const createRes = await app.inject({ method: "POST", url: "/designs", payload: { name: "Living Room" } });
    const ownerCookie = extractCookie(createRes);
    const created = createRes.json();

    const shareRes = await app.inject({
      method: "POST",
      url: `/designs/${created.meta.id}/share`,
      headers: ownerCookie ? { cookie: ownerCookie } : {}
    });
    expect(shareRes.statusCode).toBe(201);
    const { token } = shareRes.json();

    // Fetch with NO cookie at all - share tokens are independent of auth.
    const publicRes = await app.inject({ method: "GET", url: `/share/${token}` });
    expect(publicRes.statusCode).toBe(200);
    const doc = publicRes.json();
    expect(doc.meta.name).toBe("Living Room");
    // No owner info anywhere in the payload.
    expect(JSON.stringify(doc)).not.toMatch(/ownerId|owner_id/i);

    // Revoke (owner-only) then the same token 404s.
    const revokeRes = await app.inject({
      method: "DELETE",
      url: `/designs/${created.meta.id}/share`,
      headers: ownerCookie ? { cookie: ownerCookie } : {}
    });
    expect(revokeRes.statusCode).toBe(204);

    const afterRevoke = await app.inject({ method: "GET", url: `/share/${token}` });
    expect(afterRevoke.statusCode).toBe(404);
  });

  it("a shared design never carries the street address / PII - only coarse site", async () => {
    const createRes = await app.inject({ method: "POST", url: "/designs", payload: { name: "Flat" } });
    const ownerCookie = extractCookie(createRes);
    const created = createRes.json();

    const shareRes = await app.inject({
      method: "POST",
      url: `/designs/${created.meta.id}/share`,
      headers: ownerCookie ? { cookie: ownerCookie } : {}
    });
    const { token } = shareRes.json();

    const publicRes = await app.inject({ method: "GET", url: `/share/${token}` });
    const raw = JSON.stringify(publicRes.json());
    expect(raw).not.toMatch(/address|street|postcode|zipcode/i);
  });
});

function extractCookie(res: { headers: Record<string, unknown> }): string | undefined {
  const setCookie = res.headers["set-cookie"];
  if (!setCookie) return undefined;
  const raw = Array.isArray(setCookie) ? (setCookie[0] as string) : (setCookie as string);
  return raw.split(";")[0];
}
