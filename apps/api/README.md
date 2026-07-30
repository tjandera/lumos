# `@interior/api`

Fastify backend: the catalog, design persistence, share links, and proxies for the two
features that need a server-side API key (photo room import and photoreal re-lighting).

```bash
pnpm --filter @interior/api dev     # tsx watch, http://127.0.0.1:8787
pnpm --filter @interior/api test
```

Runs fine with no configuration at all — file-backed storage, an offline mock AI provider,
and the AI image features reporting themselves as unconfigured.

## Routes

### Health

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/health` | Liveness. Process only — deliberately checks nothing external. |
| `GET` | `/readyz` | Readiness. **Also pings Postgres**; `503` when unreachable. |

The split matters in Kubernetes: restarting a pod can't fix a down database, so liveness
must not check it, while readiness must or traffic gets routed to an instance that fails
every write. See [`deploy/README.md`](../../deploy/README.md#probes).

### Catalog

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/catalog` | Filterable by category, dimensions, budget. |
| `GET` | `/catalog/:id` | One item. |

### Designs

| Method | Path | Auth |
| --- | --- | --- |
| `GET` | `/designs` | Lists, marking which are yours. |
| `GET` | `/designs/:id` | Owner only. |
| `POST` | `/designs` | Claims ownership for the calling session. |
| `PUT` | `/designs/:id` | Owner only. |
| `DELETE` | `/designs/:id` | Owner only. |
| `POST` | `/designs/:id/share` | Mints an unguessable share token. |
| `DELETE` | `/designs/:id/share` | Revokes it. |

### Share

| Method | Path | Auth |
| --- | --- | --- |
| `GET` | `/share/:token` | **None** — that's the point. Read-only, and the document has already had its coordinates coarsened. |

### AI

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/ai/status` | `{enabled, provider}` — lets the client tell "off" from "on but mocked". |
| `POST` | `/ai/chat` | The agentic loop, streamed. 404s entirely when `FEATURE_AI=false`. Rate-limited 20/min per IP. |
| `GET` | `/room-photo/status` | Whether photo import is configured. |
| `POST` | `/room-photo/analyze` | Photo → vision model → validated `RoomPhotoProposal`. |
| `GET` | `/light-study/status` | Availability, mock flag, and the five presets. |
| `POST` | `/light-study/relight` | Re-lights one frame. 12 MB body limit, rate-limited 12 per 5 min — this is the priciest call the server can make. |

## Auth

Deliberately lightweight: an anonymous session cookie, signed with `SESSION_SECRET`,
establishes design ownership. There are no accounts and no passwords.

`SESSION_SECRET` **must be set in any deployment.** Unset, the server logs a warning and
falls back to a hard-coded development default — which would let anyone forge the cookie
and claim ownership of any design. Rotating it invalidates sessions but not designs.

Share tokens are independent of the session: an unguessable token grants read-only access
with no cookie at all.

## Storage

Three interfaces — `DesignStorage`, `OwnershipStore`, `ShareTokenStore` — with two
implementations each, selected by whether `DATABASE_URL` is set.

**File-backed (default).** One JSON file per design plus `owners.json` / `shares.json`,
under `apps/api/data/designs`, written atomically via temp-file + rename. Zero setup, and
per-instance: it does not survive rescheduling and is wrong for more than one replica.

**Postgres.** Three tables (`designs`, `owners`, `shares`) created idempotently at startup
— no migration framework, since the schema is additive `CREATE TABLE IF NOT EXISTS`. The
document is stored as `jsonb`; every query is parameterized. `pg.Pool` connection pooling,
a startup ping that fails fast with a clear message rather than letting the first request
surface a confusing pool error, and `pool.end()` on graceful shutdown.

Both implementations run against the same shared contract test suites, so they cannot
diverge in behaviour. Postgres tests use `pg-mem`.

## Configuration

Reads `apps/api/.env` via Node 22's built-in `process.loadEnvFile` — no dotenv dependency,
and a missing file is fine because every value has a default. See the
[configuration table](../../README.md#configuration) in the root README.

## Shutdown

`SIGTERM`/`SIGINT` closes Fastify, which runs the `onClose` hooks, which ends the Postgres
pool. Startup failures — including the Postgres ping — exit non-zero with an explicit
message rather than starting in a broken state.
