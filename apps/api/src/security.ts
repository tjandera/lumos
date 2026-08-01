/**
 * Deployment-facing security posture, in one place so it can be reviewed as a unit.
 *
 * Everything here exists because of a specific way a public deployment goes wrong, and
 * each is documented with which one.
 */
import type { FastifyInstance } from "fastify";

/**
 * Whether to believe `X-Forwarded-For`.
 *
 * This matters more than it looks. Fastify derives `request.ip` from the socket unless
 * told otherwise, so **behind any reverse proxy — an ingress, Cloud Run, Cloudflare —
 * every request appears to come from the proxy**. The per-IP rate limiters then collapse
 * into a single global bucket: one visitor can exhaust the budget for everybody, and no
 * individual abuser is ever isolated.
 *
 * It cannot simply default to `true`, though. When nothing is stripping the header,
 * trusting it lets any client claim any IP and walk straight through the same limiters.
 * So it is opt-in, and the operator states how many proxy hops they actually have:
 *
 *   TRUST_PROXY unset  -> trust nothing (correct for a directly-exposed process)
 *   TRUST_PROXY=1      -> trust the last hop  (one ingress / one load balancer)
 *   TRUST_PROXY=2      -> two hops            (e.g. Cloudflare in front of Cloud Run)
 *   TRUST_PROXY=true   -> trust the whole chain (only behind a fully trusted network)
 */
export function resolveTrustProxy(env = process.env): boolean | number {
  const raw = env.TRUST_PROXY?.trim();
  if (!raw) return false;
  if (raw === "true") return true;
  if (raw === "false") return false;
  const hops = Number(raw);
  return Number.isInteger(hops) && hops > 0 ? hops : false;
}

/**
 * Which browser origins may make credentialed requests.
 *
 * The previous policy allowed *any* `localhost`/`127.0.0.1` origin unconditionally,
 * including in production. Origin is browser-controlled and not forgeable by a remote
 * page, but it does mean any app the visitor happens to be running locally — a random dev
 * server on :3000 — could read and modify their designs on the deployed API. Convenient
 * in development, indefensible in production, so it is now gated on NODE_ENV.
 */
export function corsOriginMatcher(
  configured: string | string[] | undefined,
  env = process.env,
): (origin: string | undefined) => boolean {
  const isProd = env.NODE_ENV === "production";
  const allowed = new Set(
    (Array.isArray(configured) ? configured : [configured ?? env.VITE_ORIGIN ?? "http://localhost:5173"])
      .filter((o): o is string => Boolean(o))
      .map((o) => o.replace(/\/$/, "")),
  );

  return (origin) => {
    // Same-origin and non-browser callers (curl, server-to-server) send no Origin.
    if (!origin) return true;
    const normalised = origin.replace(/\/$/, "");
    if (allowed.has(normalised)) return true;
    if (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalised)) return true;
    return false;
  };
}

/**
 * Response headers that cost nothing and remove whole bug classes.
 *
 * Set on the API rather than only at the edge, because the API is reachable directly in
 * plenty of deployments (port-forward, another origin, a misconfigured ingress) and a
 * security header that only exists at the proxy is not a property of the service.
 */
export function registerSecurityHeaders(app: FastifyInstance, env = process.env): void {
  const isProd = env.NODE_ENV === "production";

  app.addHook("onSend", async (_request, reply, payload) => {
    // JSON API responses are never a document, a script, or a frame target.
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    // Nothing here should ever be embedded or execute; a restrictive CSP on API
    // responses costs nothing and blunts any reflected-content mistake.
    reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    reply.header("Cross-Origin-Resource-Policy", "same-site");
    // Only meaningful over TLS, and actively harmful to set in local http development
    // because browsers remember it for the whole host including other ports.
    if (isProd) {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    return payload;
  });
}
