# Security & launch readiness

Findings from a full pass over the codebase, what was fixed, and what you must configure
before pointing a public URL at this.

## Verdict

**Deployable, once you set five environment variables.** The architecture was already
sound — no SQL injection surface (every query parameterised), no known-vulnerable
dependencies (`pnpm audit --prod`: clean), share tokens from `randomBytes`, ownership
checked on every design route, secrets out of the image. What was missing was the set of
things that only matter once the URL is public, and those are now in place.

The one thing you cannot skip: **the image endpoints spend your money and are
unauthenticated by design.** Read [Cost exposure](#cost-exposure-read-this-one).

## What was wrong, and what changed

| Severity | Finding | Status |
| --- | --- | --- |
| **High** | Unmetered spend: `/image-day/generate` holds a server-side OpenAI key, needs no auth, and had only a per-IP rate limit — trivially bypassed by rotating addresses. A public URL was a free image generator funded by whoever owns the key. | Fixed — daily budget ceiling (`spendGuard.ts`), verified live: with `IMAGE_DAILY_MAX=2`, the third call returns 429. |
| **High** | `trustProxy` unset. Behind *any* proxy — ingress, Cloud Run, Cloudflare — `request.ip` is the proxy, so every per-IP limiter collapsed into one global bucket. One visitor could exhaust everyone's budget and no abuser was ever isolated. | Fixed — opt-in `TRUST_PROXY` with an explicit hop count. Not defaulted to `true`, because trusting `X-Forwarded-For` with nothing stripping it lets clients spoof their IP straight past the same limiters. |
| **Medium** | CORS allowed **any** `localhost`/`127.0.0.1` origin, in production too. Any app the visitor happened to be running locally could read and modify their designs on the deployed API. | Fixed — localhost is allowed only when `NODE_ENV !== 'production'`. |
| **Medium** | PII coarsening was **client-side only**. `CLAUDE.md` requires coarse coordinates in shareable documents, and the web client honoured it — but it was the only thing that did. A precise `site` posted by anything else was stored verbatim and served to anyone holding the share token. | Fixed — the server coarsens on write, in `migrateSceneDocument`, where it cannot be bypassed. A test that asserted precise coordinates round-trip has been corrected; it was encoding the hole. |
| **Medium** | No security headers on API responses. | Fixed — `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a locked-down CSP, `Cross-Origin-Resource-Policy`, and HSTS in production only (setting it over local http poisons the whole host for other ports). |
| **Low** | The rate limiter's map never evicted expired entries, so it grew once per distinct IP forever — visitor-driven memory growth on a public deployment. | Fixed — sweeps on write, proportional to live traffic, no timer. |

### Known and accepted

- **Rate limits and the budget are per-process.** Two replicas means two counters, so the
  effective ceiling is `replicas × IMAGE_DAILY_MAX`. Divide accordingly, or pin the API to
  one instance. A shared counter means Redis, and a service that cannot boot without Redis
  is a worse default than one that over-counts by a known factor.
- **`sameSite: 'lax'` on the session cookie.** Correct for the single-origin ingress this
  repo ships. If you split the web and API across different registrable domains, the
  cookie stops flowing on cross-site requests and design ownership breaks; that needs
  `sameSite: 'none'` **and** `secure`, which is a deliberate decision, not a default.
- **Anonymous ownership.** There are no accounts. Whoever holds the cookie owns the design.
  Clearing cookies loses access. That is the intended product, not an oversight.

## Cost exposure (read this one)

The AI endpoints are unauthenticated on purpose — a visitor should be able to try the
feature without signing up. That is fine until the URL is public, at which point anyone
who finds it can generate images on your key.

Three layers now stand between a public URL and your bill:

1. **Per-IP rate limit** — 30 requests / 5 min. Stops one person hammering it. Only
   effective with `TRUST_PROXY` set correctly.
2. **Daily budget** — `IMAGE_DAILY_MAX` (default **100**, deliberately small). A hard stop
   regardless of how many distinct IPs show up. `/image-day/status` reports
   `available: false` once spent, so the UI explains itself instead of queuing twelve
   doomed requests.
3. **Your own OpenAI spend limit** — set a hard monthly cap in the OpenAI dashboard. This
   is the only layer not under this codebase's control, and the only one that survives a
   bug in the other two. **Set it.**

If you want the feature genuinely private, don't rely on obscurity: put
**Cloudflare Access** (free, email/SSO gate) or **Turnstile** in front of the API origin.

## Where to host it, free

| Tier | Platform | Why |
| --- | --- | --- |
| Web (static) | **Cloudflare Pages** | Free, unlimited bandwidth, global CDN, automatic TLS, HTTP/2 and /3. HTTP/2 is what makes the panel's "All at once" setting actually parallel — see the note in `apps/web/src/imageDay/README.md`. Access/Turnstile available on the same account. |
| API (container) | **Google Cloud Run** | Genuine always-free monthly allowance, scales to zero, deploys the existing `apps/api/Dockerfile` unchanged, request timeout configurable to 60 minutes, native Secret Manager integration, automatic TLS. |
| Postgres | **Neon** free tier | Serverless Postgres, scales to zero, plain connection string straight into `DATABASE_URL`. |

**Why Cloud Run rather than the obvious choices:** image generation takes 35–90 s per
call. Vercel Hobby caps a function at 60 s and Netlify's standard functions at 10 s, so
the feature times out on both — they are excellent for the static tier and wrong for this
API. Cloudflare Workers is a poor fit separately: this is a Fastify app handling 16 MB
bodies, not a Workers-runtime handler. Render's free tier sleeps after 15 minutes with a
slow cold start and gives 512 MB, below the 1 GiB this API wants when generating
concurrently.

**The honest caveat:** Cloud Run's free allowance requires a billing account on file. If
you want *no card at all*, use **Render** or **Koyeb** free and accept the cold start, and
set `IMAGE_DAILY_MAX` lower since you'll have less memory headroom.

## Configuration checklist

Set on the API before going public:

| Variable | Value | Why |
| --- | --- | --- |
| `SESSION_SECRET` | `openssl rand -base64 48` | **Required.** Unset falls back to a hard-coded, publicly-known default, and anyone could forge the ownership cookie. |
| `NODE_ENV` | `production` | Turns on `secure` cookies and HSTS, and turns *off* the localhost CORS allowance. |
| `TRUST_PROXY` | `1` on Cloud Run; `2` behind Cloudflare → Cloud Run | Without it every rate limit is one global bucket. Count your actual hops. |
| `VITE_ORIGIN` | your Pages URL | The CORS allowlist. |
| `IMAGE_DAILY_MAX` | e.g. `50` | Your ceiling. Divide by replica count. |
| `DATABASE_URL` | Neon connection string | Otherwise designs live on a per-instance disk and vanish on redeploy. |
| `OPENAI_API_KEY` | via Secret Manager, never an env literal in a config file | See the leak post-mortem in this repo's history for why. |

Build the web image with `VITE_API_URL` pointing at the API's public URL (it is baked in
at build time — see `deploy/README.md`).

And in the OpenAI dashboard: **set a monthly hard limit.** Everything above is defence in
depth; that is the backstop.

## Verified, not assumed

Checked against a running server with `NODE_ENV=production`:

- Security headers present on responses, HSTS included.
- `Origin: https://evil.example.com` → no `Access-Control-Allow-Origin`.
- `Origin: http://localhost:3000` → no `Access-Control-Allow-Origin` (this used to be allowed).
- `Origin: https://interior.example.com` → allowed.
- `IMAGE_DAILY_MAX=2` against the live key → two images generated, third refused with 429,
  `/image-day/status` then reporting `available: false`.
- `pnpm audit --prod` → no known vulnerabilities.
- 189 API tests passing, including 22 new ones for the guard and the CORS/proxy logic.
