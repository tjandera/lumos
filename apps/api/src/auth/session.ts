/**
 * Lightweight anonymous-ownership session (Phase 5a). This is NOT a login
 * system — there is no username/password/identity, just a stable random uid
 * signed into an httpOnly cookie so `designs/ownership.ts` has something
 * consistent to scope "your designs" to across requests from the same
 * browser. Share tokens (`share/tokenStore.ts`) are deliberately independent
 * of this: a share link works with zero cookies, from any browser.
 *
 * NodeNext note: relative imports carry an explicit `.js` extension.
 */

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import cookiePlugin from "@fastify/cookie";

export const SESSION_COOKIE_NAME = "interior_session";

const DEV_DEFAULT_SECRET = "dev-insecure-session-secret-change-me-in-prod";

/**
 * Resolve `SESSION_SECRET` from the environment. Falls back to a fixed
 * (insecure, publicly-known) dev default with a loud startup warning — good
 * enough to run locally, never acceptable for a real deployment.
 */
export function resolveSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.trim().length > 0) return secret;
  console.warn(
    "[auth] SESSION_SECRET is not set - falling back to an insecure development default. " +
      "Set SESSION_SECRET to a long random value before deploying."
  );
  return DEV_DEFAULT_SECRET;
}

function hmac(uid: string, secret: string): string {
  return createHmac("sha256", secret).update(uid).digest("base64url");
}

/** Sign a uid into a `uid.hmac` cookie value. */
export function signSessionValue(uid: string, secret: string): string {
  return `${uid}.${hmac(uid, secret)}`;
}

/**
 * Verify a signed session cookie value. Returns the uid if the signature is
 * valid, or `null` if the value is missing, malformed, or tampered with
 * (constant-time signature comparison so this isn't a timing oracle).
 */
export function verifySessionValue(value: string | undefined | null, secret: string): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const uid = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  const expected = hmac(uid, secret);

  const macBuf = Buffer.from(mac);
  const expectedBuf = Buffer.from(expected);
  if (macBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(macBuf, expectedBuf)) return null;
  return uid;
}

declare module "fastify" {
  interface FastifyRequest {
    /**
     * Anonymous-ownership uid from the signed session cookie. Set on every
     * request by the `onRequest` hook registered in `registerSession` -
     * issued fresh (and cookied) on a visitor's first request, verified and
     * reused on every request after that.
     */
    ownerId: string;
  }
}

export interface RegisterSessionOptions {
  secret: string;
}

/**
 * Registers `@fastify/cookie` and an `onRequest` hook that guarantees every
 * request has a valid `request.ownerId`: verifies the existing signed cookie
 * if present and valid, otherwise mints a fresh random uid and sets it as a
 * new httpOnly cookie. Must be called directly on the top-level app (not via
 * `app.register(fn)`, which would create a new encapsulation context) so the
 * hook and `request.ownerId` decoration apply to every route registered
 * afterwards, including ones registered in their own plugin scopes.
 */
export async function registerSession(app: FastifyInstance, options: RegisterSessionOptions): Promise<void> {
  await app.register(cookiePlugin);

  app.decorateRequest("ownerId", "");

  app.addHook("onRequest", async (request, reply) => {
    const raw = request.cookies[SESSION_COOKIE_NAME];
    let uid = verifySessionValue(raw, options.secret);
    if (!uid) {
      uid = randomUUID();
      reply.setCookie(SESSION_COOKIE_NAME, signSessionValue(uid, options.secret), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 365
      });
    }
    request.ownerId = uid;
  });
}
