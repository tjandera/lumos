import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { RateLimitCheck } from "../ai/rateLimit.js";
import type { DesignStorage } from "../designs/storage.js";
import type { OwnershipStore } from "../designs/ownership.js";
import { setSessionCookie, clearSessionCookie } from "./session.js";
import {
  dummyVerify,
  hashPassword,
  needsRehash,
  passwordProblem,
  verifyPassword,
} from "./password.js";
import {
  emailProblem,
  isAnonymousOwner,
  normaliseEmail,
  ownerIdForUser,
  userIdFromOwnerId,
  type UserStore,
} from "./users.js";

const credentialsSchema = z.object({
  email: z.string().max(400),
  password: z.string().max(1000),
});

export interface AuthRouteOptions {
  /** Absent when no database is configured — accounts then report unavailable. */
  users?: UserStore;
  storage: DesignStorage;
  ownership: OwnershipStore;
  sessionSecret: string;
  /** Per-IP limit on credential submission. */
  checkRateLimit?: RateLimitCheck;
  /** Per-email limit, so one account can't be brute-forced from many addresses. */
  checkEmailRateLimit?: RateLimitCheck;
}

/**
 * Accounts: register, sign in, sign out.
 *
 * Layered on top of the existing anonymous session rather than replacing it. Everyone
 * still gets a signed cookie on their first request; signing in swaps the random UUID
 * inside it for `user:<id>`. Because `OwnershipStore` only ever compares opaque strings,
 * nothing else in the codebase had to change.
 */
export async function authRoutes(app: FastifyInstance, opts: AuthRouteOptions): Promise<void> {
  const { users, storage, ownership, sessionSecret, checkRateLimit, checkEmailRateLimit } = opts;

  /**
   * Move everything the anonymous session owned to the account.
   *
   * Without this, signing up *loses your work* — the designs you just made stay attached
   * to a cookie you no longer use. That is the single worst thing an account system can
   * do on its first interaction, so it happens on both register and login.
   */
  async function adoptAnonymousDesigns(fromOwnerId: string, toOwnerId: string): Promise<number> {
    if (!isAnonymousOwner(fromOwnerId) || fromOwnerId === toOwnerId) return 0;
    let moved = 0;
    for (const summary of await storage.list()) {
      if ((await ownership.getOwner(summary.id)) === fromOwnerId) {
        await ownership.setOwner(summary.id, toOwnerId);
        moved += 1;
      }
    }
    return moved;
  }

  const unavailable = (reply: FastifyReply) =>
    reply.code(503).send({
      error: "Accounts need a database. Set DATABASE_URL on the server, or keep using the app anonymously.",
    });

  app.get("/auth/status", async () => ({ available: Boolean(users) }));

  app.get("/auth/me", async (request: FastifyRequest) => {
    const userId = userIdFromOwnerId(request.ownerId);
    if (!users || !userId) return { user: null };
    const user = await users.findById(userId);
    // A cookie naming a user that no longer exists is stale, not an error; report signed
    // out and let the next write land under a fresh anonymous session.
    return { user: user ? { id: user.id, email: user.email } : null };
  });

  app.post<{ Body: unknown }>("/auth/register", async (request, reply) => {
    if (!users) return unavailable(reply);
    if (checkRateLimit && !(await checkRateLimit(request.ip))) {
      return reply.code(429).send({ error: "Too many attempts — try again shortly." });
    }

    const body = credentialsSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Email and password are required." });

    const emailIssue = emailProblem(body.data.email);
    if (emailIssue) return reply.code(400).send({ error: emailIssue });
    const passwordIssue = passwordProblem(body.data.password);
    if (passwordIssue) return reply.code(400).send({ error: passwordIssue });

    const hash = await hashPassword(body.data.password);
    const user = await users.create(body.data.email, hash);
    // Taken. Said plainly: an account system that hides which addresses are registered
    // cannot also offer a working "sign in" button, so pretending otherwise buys nothing
    // and just leaves people stuck on a form that won't say why.
    if (!user) return reply.code(409).send({ error: "That email already has an account. Sign in instead." });

    const ownerId = ownerIdForUser(user.id);
    const adopted = await adoptAnonymousDesigns(request.ownerId, ownerId);
    setSessionCookie(reply, ownerId, sessionSecret);
    return reply.code(201).send({ user: { id: user.id, email: user.email }, adoptedDesigns: adopted });
  });

  app.post<{ Body: unknown }>("/auth/login", async (request, reply) => {
    if (!users) return unavailable(reply);
    if (checkRateLimit && !(await checkRateLimit(request.ip))) {
      return reply.code(429).send({ error: "Too many attempts — try again shortly." });
    }

    const body = credentialsSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Email and password are required." });

    const email = normaliseEmail(body.data.email);
    // Also limited per email, or an attacker with a botnet spreads attempts across
    // addresses and never trips the per-IP limit on any single one.
    if (checkEmailRateLimit && !(await checkEmailRateLimit(email))) {
      return reply.code(429).send({ error: "Too many attempts for this account — try again shortly." });
    }

    const found = await users.findByEmail(email);
    if (!found) {
      // Burn equivalent work on a miss. Otherwise "no such user" returns in a millisecond
      // and "wrong password" takes ~100ms, which is a reliable oracle for which addresses
      // have accounts.
      await dummyVerify(body.data.password);
      return reply.code(401).send({ error: "Wrong email or password." });
    }

    if (!(await verifyPassword(body.data.password, found.passwordHash))) {
      return reply.code(401).send({ error: "Wrong email or password." });
    }

    // Upgrade the stored hash if the cost has since been raised. Only possible here,
    // because this is the one moment the plaintext is in hand.
    if (needsRehash(found.passwordHash)) {
      await users.updatePasswordHash(found.user.id, await hashPassword(body.data.password));
    }

    const ownerId = ownerIdForUser(found.user.id);
    const adopted = await adoptAnonymousDesigns(request.ownerId, ownerId);
    setSessionCookie(reply, ownerId, sessionSecret);
    return reply.send({ user: { id: found.user.id, email: found.user.email }, adoptedDesigns: adopted });
  });

  app.post("/auth/logout", async (_request, reply) => {
    // Clearing the cookie is the whole of it. The next request is issued a fresh
    // anonymous session, so the app keeps working rather than dead-ending on a login wall.
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });
}
