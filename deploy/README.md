# Deployment

Two supported paths: **Docker Compose** for a single host, and **Kubernetes** for
anything else. Both build from the same two images.

- [Images](#images)
- [Docker Compose](#docker-compose)
- [Kubernetes](#kubernetes)
- [The build-time API URL](#the-build-time-api-url) ← read this one
- [Secrets](#secrets)
- [Probes](#probes)
- [Scaling](#scaling)
- [Security](#security) ← read before going public
- [Production checklist](#production-checklist)
- [Troubleshooting](#troubleshooting)

## Images

| Image | Contents | Runs as | Port |
| --- | --- | --- | --- |
| `interior-api` | Node 22, Fastify, `@interior/core` + `@interior/ai` | non-root `appuser` | 3001 |
| `interior-web` | nginx-unprivileged serving the static Vite bundle | uid 101 | 8080 |

**Both build from the repository root**, not from their app directory — they consume
workspace packages that live outside it:

```bash
docker build -f apps/api/Dockerfile -t interior-api:local .
docker build -f apps/web/Dockerfile -t interior-web:local \
  --build-arg VITE_API_URL=/api .
```

Both are multi-stage (`pnpm fetch` → offline install → build → slim runtime), so the
dependency layer only invalidates when `pnpm-lock.yaml` changes. Both declare a
`HEALTHCHECK`.

## Docker Compose

```bash
docker compose up --build
```

| Service | URL |
| --- | --- |
| web | http://localhost:8080 |
| api | http://localhost:3001 |
| postgres | internal (`postgres-data` volume) |

Override anything with a gitignored `.env` beside `docker-compose.yml`:

```bash
cat >> .env <<'EOF'
FEATURE_AI=false
WEB_PORT=3000
LIGHT_STUDY_MOCK=true
EOF
```

Setting `DATABASE_URL=` (blank) switches the API back to the file-backed JSON store while
still running the Postgres container.

## Kubernetes

Kustomize, with a base and two overlays:

```
deploy/k8s/
├── base/                 namespace, configmap, api, web, ingress, postgres
└── overlays/
    ├── local/            kind/minikube: 1 replica, local images, mocked AI, no HPAs
    └── production/       registry images, managed Postgres, topology spread
```

The base is not meant to be applied directly — it carries placeholder image names and a
placeholder Ingress host that an overlay replaces.

### Local cluster

```bash
# 1. Build both images. VITE_API_URL=/api makes the browser call the same
#    origin, which is what the Ingress routes.
docker build -f apps/api/Dockerfile -t interior-api:local .
docker build -f apps/web/Dockerfile -t interior-web:local --build-arg VITE_API_URL=/api .

# 2. Get them onto the node (kind shown; minikube: `minikube image load ...`)
kind load docker-image interior-api:local interior-web:local

# 3. Postgres credentials for the bundled StatefulSet
kubectl create namespace interior-design
kubectl -n interior-design create secret generic postgres-secrets \
  --from-literal=POSTGRES_USER=interior \
  --from-literal=POSTGRES_PASSWORD="$(openssl rand -base64 24)" \
  --from-literal=POSTGRES_DB=interior

# 4. API secrets, pointed at that Postgres
kubectl -n interior-design create secret generic api-secrets \
  --from-literal=SESSION_SECRET="$(openssl rand -base64 48)" \
  --from-literal=DATABASE_URL="postgresql://interior:PASSWORD@postgres:5432/interior"

# 5. Deploy
kubectl apply -k deploy/k8s/overlays/local
kubectl -n interior-design rollout status deploy/api deploy/web
```

With an ingress controller installed, the app is at `http://interior.localtest.me`
(`*.localtest.me` resolves to 127.0.0.1 with no `/etc/hosts` edit). Without one:

```bash
kubectl -n interior-design port-forward svc/web 8080:80
```

Preview the rendered manifests any time without applying:

```bash
kubectl kustomize deploy/k8s/overlays/local
```

### Production

Copy `overlays/production` and change, at minimum:

1. `images[].newName` → your registry.
2. `images[].newTag` → an **immutable** tag or digest. `latest` makes rollouts
   non-reproducible and rollbacks meaningless.
3. The Ingress host → your domain.
4. `VITE_ORIGIN` in the ConfigMap patch → the same domain. It is the CORS allowlist.

The production overlay deletes the in-cluster Postgres, on the assumption `DATABASE_URL`
points at a managed database. A single-replica StatefulSet has no failover, no backups and
no point-in-time recovery; it exists so a fresh cluster comes up working, not because it
is a production database.

```bash
kubectl apply -k deploy/k8s/overlays/production
```

## The build-time API URL

The single most common way to get a broken deployment.

`VITE_API_URL` is substituted into the JavaScript bundle by Vite **at build time**
(`apps/web/src/api/client.ts`). Setting it as a container environment variable does
nothing — the bundle was compiled before the container existed.

Two ways to handle it:

**Same origin (recommended).** Build with `--build-arg VITE_API_URL=/api` and let the
Ingress route `/api/*` to the API service, rewriting the prefix away. One image runs in
every environment, and there is no CORS and no third-party-cookie handling for the
ownership session. This is what the bundled Ingress does.

**Absolute URL.** Build one image per environment with
`--build-arg VITE_API_URL=https://api.example.com`, and set `VITE_ORIGIN` on the API to
the web origin so CORS permits it.

## Secrets

The base kustomization deliberately contains **no** Secret, so no `kubectl apply -k` can
ever ship placeholder credentials. `base/secret.example.yaml` is a documented template
only — create the real one out-of-band, or point External Secrets / Sealed Secrets /
Vault / a cloud CSI driver at the same name and keys.

| Key | Consumer | Consequence of leaving it unset |
| --- | --- | --- |
| `SESSION_SECRET` | api | **Falls back to a hard-coded development default.** Anyone could forge ownership of any design. Always set it. |
| `DATABASE_URL` | api | Falls back to the per-pod file store — designs vanish on reschedule and differ between replicas. |
| `OPENAI_API_KEY` | api | Photo import and photoreal re-lighting report themselves as unconfigured. Everything else works. |
| `AI_PROVIDER_API_KEY` | api | The chat assistant uses its offline mock responder. |

Every key is mounted with `optional: true`, so a Secret containing only what you actually
use is valid.

Rotating `SESSION_SECRET` invalidates existing sessions. Designs themselves are unaffected.

## Probes

Liveness and readiness answer different questions, and the split is deliberate:

| Probe | Path | Checks | On failure |
| --- | --- | --- | --- |
| liveness | `/health` | process only | pod restarts |
| readiness | `/readyz` | **plus Postgres** | pod leaves the Service |
| startup | `/health` | process, 60s budget | holds liveness off during a cold start |

Liveness must never check the database: restarting a pod cannot fix a down Postgres, and a
probe that tried would turn one database blip into a cluster-wide crash-loop. Readiness
must, or traffic gets routed to an instance that will fail every design read and write.

`/readyz` returns `200 {"ok":true,"storage":"postgres"|"file"}` or `503` when the database
is unreachable.

## Scaling

**web** is fully stateless — all rendering happens in the visitor's browser. It scales on
initial page-load volume only, and scenes being heavy costs the server nothing.

**api** is stateless *when `DATABASE_URL` is set*. With the file-backed fallback each pod
holds its own designs on local disk, so **do not run more than one replica** until
Postgres is configured.

Both HPAs target CPU. The API's scale-down uses a 5-minute stabilization window because AI
calls are slow and bursty, and tearing down capacity between bursts just makes the next
burst slow.

Resource requests are deliberately small (api 50m/128Mi, web 10m/32Mi); the API's 512Mi
limit is set by image-generation payloads (the route caps bodies at 12 MB), not by
steady-state load.

## Security

A full audit — findings, fixes, the configuration you must set, and a free hosting
recommendation — is in **[`SECURITY.md`](SECURITY.md)**. The short version: set
`SESSION_SECRET`, `NODE_ENV=production`, `TRUST_PROXY`, `VITE_ORIGIN` and
`IMAGE_DAILY_MAX`, and put a hard monthly cap on the OpenAI key.

## Production checklist

- [ ] `SESSION_SECRET` set to a long random value
- [ ] `DATABASE_URL` pointing at a managed Postgres with backups
- [ ] Images pinned to an immutable tag or digest, not `latest`
- [ ] Ingress host and `VITE_ORIGIN` both set to the real domain
- [ ] TLS configured (uncomment the `tls:` block and the cert-manager annotation)
- [ ] Web image built with the right `VITE_API_URL` for the routing you chose
- [ ] In-cluster Postgres removed if using a managed one (the production overlay does this)
- [ ] `LIGHT_STUDY_MOCK` / `ROOM_PHOTO_MOCK` **not** left on in a real environment
- [ ] Metrics-server installed if you want the HPAs to do anything
- [ ] `TRUST_PROXY` set to your real hop count (rate limiting is inert without it)
- [ ] `IMAGE_DAILY_MAX` set, and divided by replica count — the budget is per process
- [ ] A hard monthly spend limit set in the OpenAI dashboard

## Troubleshooting

**Web loads, every API call fails.** Almost always the build-time URL. Check what got
baked in: `docker run --rm interior-web:local grep -ro 'localhost:3001' /usr/share/nginx/html | head`.
If it's there and you meant to use the Ingress, rebuild with `--build-arg VITE_API_URL=/api`.

**API pods never become ready.** `/readyz` is failing, which means Postgres. Check
`kubectl -n interior-design logs deploy/api` — the startup ping fails fast with an explicit
message. Verify `DATABASE_URL` in the Secret and that the database accepts connections from
the cluster.

**`ImagePullBackOff` on a local cluster.** The image is on your host but not on the node.
`kind load docker-image` / `minikube image load` it. The local overlay already sets
`imagePullPolicy: Never` so the kubelet stops trying to pull.

**`413` on photo import or re-lighting.** The ingress body limit. The bundled Ingress sets
`proxy-body-size: 16m`; other controllers need their own equivalent.

**Re-lighting times out.** Image generation regularly exceeds the 60s proxy default. The
bundled Ingress sets read/send timeouts to 180s.

**Postgres pod `CrashLoopBackOff` with "directory not empty".** A mounted volume always
contains `lost+found`, and initdb refuses to run into a non-empty directory. The
StatefulSet already sets `PGDATA` to a subdirectory; if you changed it, put it back.
