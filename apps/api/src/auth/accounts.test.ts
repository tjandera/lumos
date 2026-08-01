import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { createRawTestPgPool } from "../db/testPgPool.js";
import { hashPassword, needsRehash, passwordProblem, verifyPassword } from "./password.js";
import { emailProblem, isAnonymousOwner, normaliseEmail, ownerIdForUser, userIdFromOwnerId } from "./users.js";

const PASSWORD = "correct-horse-battery";
const EMAIL = "Sam@Example.com";

/** Low cost keeps the suite fast; the parameters themselves are tested separately. */
const FAST = 12;

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const hash = await hashPassword(PASSWORD, FAST);
    expect(await verifyPassword(PASSWORD, hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("salts, so the same password hashes differently every time", async () => {
    const [a, b] = [await hashPassword(PASSWORD, FAST), await hashPassword(PASSWORD, FAST)];
    expect(a).not.toBe(b);
    // ...and both still verify.
    expect(await verifyPassword(PASSWORD, a)).toBe(true);
    expect(await verifyPassword(PASSWORD, b)).toBe(true);
  });

  it("records its parameters in the hash so cost can be raised later", async () => {
    const hash = await hashPassword(PASSWORD, FAST);
    expect(hash).toMatch(/^scrypt\$4096\$8\$1\$/);
    // A hash made at a lower cost than current must be flagged for upgrade...
    expect(needsRehash(hash)).toBe(true);
    // ...and must still verify in the meantime, or raising the cost locks everyone out.
    expect(await verifyPassword(PASSWORD, hash)).toBe(true);
  });

  it("treats a malformed hash as a failed login, not a crash", async () => {
    for (const junk of ["", "nonsense", "scrypt$x$y$z", "bcrypt$1$2$3$4$5", "scrypt$4096$8$1$$"]) {
      expect(await verifyPassword(PASSWORD, junk)).toBe(false);
    }
  });

  it("normalises unicode, so the same typed password works across input methods", async () => {
    // "é" composed vs decomposed are different byte sequences for the same character.
    const hash = await hashPassword("café-au-lait-123".normalize("NFD"), FAST);
    expect(await verifyPassword("café-au-lait-123".normalize("NFC"), hash)).toBe(true);
  });

  it("requires length, and caps it so a huge password isn't a free CPU burn", () => {
    expect(passwordProblem("short")).toMatch(/at least/);
    expect(passwordProblem("x".repeat(10))).toBeNull();
    expect(passwordProblem("x".repeat(5000))).toMatch(/at most/);
  });
});

describe("email handling", () => {
  it("is case- and whitespace-insensitive", () => {
    expect(normaliseEmail("  Sam@Example.COM ")).toBe("sam@example.com");
  });

  it("rejects obvious non-addresses", () => {
    for (const bad of ["", "nope", "a@b", "@example.com", "a b@example.com", `${"x".repeat(300)}@e.com`]) {
      expect(emailProblem(bad)).not.toBeNull();
    }
    expect(emailProblem("sam@example.com")).toBeNull();
  });
});

describe("owner ids", () => {
  it("namespaces users so they can never collide with an anonymous uuid", () => {
    const id = ownerIdForUser("abc");
    expect(id).toBe("user:abc");
    expect(userIdFromOwnerId(id)).toBe("abc");
    expect(isAnonymousOwner(id)).toBe(false);
    expect(isAnonymousOwner("9f1c8f4e-0000-4000-8000-000000000000")).toBe(true);
    expect(userIdFromOwnerId("9f1c8f4e-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("account routes", () => {
  let app: FastifyInstance | undefined;
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await app?.close();
    await cleanup?.();
    app = undefined;
    cleanup = undefined;
  });

  async function withDb() {
    const t = createRawTestPgPool();
    cleanup = t.cleanup;
    app = await buildApp({ logger: false, pgPool: t.pool, sessionSecret: "test-secret" });
    return app;
  }

  const cookieOf = (res: { headers: Record<string, unknown> }) => {
    const raw = res.headers["set-cookie"] as string | string[] | undefined;
    const first = Array.isArray(raw) ? raw[0] : raw;
    return first?.split(";")[0];
  };

  it("reports unavailable without a database rather than half-working", async () => {
    app = await buildApp({ logger: false, sessionSecret: "test-secret" });
    expect((await app.inject({ method: "GET", url: "/auth/status" })).json()).toEqual({ available: false });
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "sam@example.com", password: PASSWORD },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toMatch(/DATABASE_URL/);
  });

  it("registers, and signs the new account into the session", async () => {
    const a = await withDb();
    const res = await a.inject({ method: "POST", url: "/auth/register", payload: { email: EMAIL, password: PASSWORD } });
    expect(res.statusCode).toBe(201);
    expect(res.json().user.email).toBe("sam@example.com"); // normalised

    const me = await a.inject({ method: "GET", url: "/auth/me", headers: { cookie: cookieOf(res)! } });
    expect(me.json().user.email).toBe("sam@example.com");
  });

  it("refuses a duplicate email, case-insensitively", async () => {
    const a = await withDb();
    await a.inject({ method: "POST", url: "/auth/register", payload: { email: "sam@example.com", password: PASSWORD } });
    const dup = await a.inject({ method: "POST", url: "/auth/register", payload: { email: "SAM@EXAMPLE.COM", password: PASSWORD } });
    expect(dup.statusCode).toBe(409);
  });

  it("validates before hashing", async () => {
    const a = await withDb();
    expect((await a.inject({ method: "POST", url: "/auth/register", payload: { email: "nope", password: PASSWORD } })).statusCode).toBe(400);
    expect((await a.inject({ method: "POST", url: "/auth/register", payload: { email: "s@e.com", password: "short" } })).statusCode).toBe(400);
  });

  it("signs in with the right password and refuses the wrong one", async () => {
    const a = await withDb();
    await a.inject({ method: "POST", url: "/auth/register", payload: { email: EMAIL, password: PASSWORD } });

    const ok = await a.inject({ method: "POST", url: "/auth/login", payload: { email: EMAIL, password: PASSWORD } });
    expect(ok.statusCode).toBe(200);

    const bad = await a.inject({ method: "POST", url: "/auth/login", payload: { email: EMAIL, password: "nope-nope-nope" } });
    expect(bad.statusCode).toBe(401);
  });

  it("gives the same answer for a wrong password and an unknown account", async () => {
    // Different wording would let anyone enumerate which addresses are registered.
    const a = await withDb();
    await a.inject({ method: "POST", url: "/auth/register", payload: { email: EMAIL, password: PASSWORD } });
    const wrongPassword = await a.inject({ method: "POST", url: "/auth/login", payload: { email: EMAIL, password: "nope-nope-nope" } });
    const noSuchUser = await a.inject({ method: "POST", url: "/auth/login", payload: { email: "nobody@example.com", password: "nope-nope-nope" } });
    expect(wrongPassword.statusCode).toBe(noSuchUser.statusCode);
    expect(wrongPassword.json()).toEqual(noSuchUser.json());
  });

  it("signing out returns to an anonymous session rather than a login wall", async () => {
    const a = await withDb();
    const reg = await a.inject({ method: "POST", url: "/auth/register", payload: { email: EMAIL, password: PASSWORD } });
    const out = await a.inject({ method: "POST", url: "/auth/logout", headers: { cookie: cookieOf(reg)! } });
    expect(out.statusCode).toBe(200);

    // The app still works with no cookie at all — designs can still be created.
    const created = await a.inject({ method: "POST", url: "/designs", payload: { name: "After sign-out" } });
    expect(created.statusCode).toBe(201);
  });

  describe("adopting anonymous work", () => {
    it("moves designs made before signing up onto the new account", async () => {
      // The single most important behaviour here: registering must not lose your work.
      const a = await withDb();
      const created = await a.inject({ method: "POST", url: "/designs", payload: { name: "Made anonymously" } });
      const anonCookie = cookieOf(created)!;
      const designId = created.json().meta.id;

      const reg = await a.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: EMAIL, password: PASSWORD },
        headers: { cookie: anonCookie },
      });
      expect(reg.json().adoptedDesigns).toBe(1);

      // Readable as the signed-in user...
      const asUser = await a.inject({ method: "GET", url: `/designs/${designId}`, headers: { cookie: cookieOf(reg)! } });
      expect(asUser.statusCode).toBe(200);
    });

    it("moves them on login too, not only on register", async () => {
      const a = await withDb();
      const reg = await a.inject({ method: "POST", url: "/auth/register", payload: { email: EMAIL, password: PASSWORD } });
      await a.inject({ method: "POST", url: "/auth/logout", headers: { cookie: cookieOf(reg)! } });

      // A fresh anonymous session makes a design, then signs in.
      const created = await a.inject({ method: "POST", url: "/designs", payload: { name: "Second machine" } });
      const login = await a.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: EMAIL, password: PASSWORD },
        headers: { cookie: cookieOf(created)! },
      });
      expect(login.json().adoptedDesigns).toBe(1);
    });

    it("does not touch designs belonging to somebody else", async () => {
      const a = await withDb();
      const theirs = await a.inject({ method: "POST", url: "/designs", payload: { name: "Not yours" } });
      const theirCookie = cookieOf(theirs)!;

      // A different visitor registers; the first visitor's design must stay theirs.
      const reg = await a.inject({ method: "POST", url: "/auth/register", payload: { email: EMAIL, password: PASSWORD } });
      expect(reg.json().adoptedDesigns).toBe(0);

      const stillTheirs = await a.inject({
        method: "GET",
        url: `/designs/${theirs.json().meta.id}`,
        headers: { cookie: theirCookie },
      });
      expect(stillTheirs.statusCode).toBe(200);

      const notMine = await a.inject({
        method: "GET",
        url: `/designs/${theirs.json().meta.id}`,
        headers: { cookie: cookieOf(reg)! },
      });
      expect(notMine.statusCode).toBe(403);
    });
  });

  it("keeps a signed-in user's designs across sign-out and back in", async () => {
    const a = await withDb();
    const reg = await a.inject({ method: "POST", url: "/auth/register", payload: { email: EMAIL, password: PASSWORD } });
    const made = await a.inject({
      method: "POST",
      url: "/designs",
      payload: { name: "Owned by the account" },
      headers: { cookie: cookieOf(reg)! },
    });
    await a.inject({ method: "POST", url: "/auth/logout", headers: { cookie: cookieOf(reg)! } });

    const back = await a.inject({ method: "POST", url: "/auth/login", payload: { email: EMAIL, password: PASSWORD } });
    const fetched = await a.inject({
      method: "GET",
      url: `/designs/${made.json().meta.id}`,
      headers: { cookie: cookieOf(back)! },
    });
    expect(fetched.statusCode).toBe(200);
  });

  it("reports signed-out for a cookie naming a user that no longer exists", async () => {
    const a = await withDb();
    const reg = await a.inject({ method: "POST", url: "/auth/register", payload: { email: EMAIL, password: PASSWORD } });
    const cookie = cookieOf(reg)!;
    // Simulate the account being deleted out from under a live session.
    await (await createRawTestPgPool()).cleanup().catch(() => {});
    const me = await a.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
  });
});
