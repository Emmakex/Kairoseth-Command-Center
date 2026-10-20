# 49 — Phase 8: Work Manager live preview and dogfooding

## Decision / Decisión

Phase 8 is explicitly promoted to put the already-delivered Gestor de Trabajo / Work Manager product in front of us as a real, persistent application instead of continuing to add product scope without using the current implementation.

This phase does **not** reopen Phases 0–7. Its purpose is deployment, real usage and operational acceptance of the product that already exists.

## Canonical live reference

- Commercial product: **Gestor de Trabajo** (ES) / **Work Manager** (EN)
- Technical repository: `Kairoseth-Command-Center`
- Public product catalog route: `/products/work-manager`
- Canonical live reference host: `https://work-manager.kairoseth.com`
- ES login: `https://work-manager.kairoseth.com/es/login`
- EN login: `https://work-manager.kairoseth.com/en/login`

The live reference is a Kairoseth-operated instance, but the product remains portable and independently deployable. The Kairoseth deployment is a dogfooding/reference installation, not a hidden platform dependency.

## Phase 8 goals

1. Deploy the existing web + API + worker + MongoDB runtime as a persistent instance.
2. Put the runtime behind the shared Kairoseth HTTPS edge without publishing application/database ports on the host.
3. Bootstrap a protected owner login for real daily usage.
4. Keep runtime/session/integration secrets outside Git and outside deployment logs.
5. Make the existing ES/EN product surfaces usable over HTTPS.
6. Start using the current project/task/alert/automation/GitHub/Agent Bridge functionality with persistent real data.
7. Observe resource usage and operational behavior so later Cloud / Private Cloud / Self-Hosted pricing is based on evidence rather than assumptions.

## Live topology

```text
Internet
  |
shared Kairoseth HTTPS edge
  |
work-manager-edge:80
  |
internal Work Manager Caddy
  |
web:3000
  |
api:4000 ---- MongoDB replica set
  |
worker ------ GitHub / enabled connectors
```

`mongo`, `api`, `worker`, `web` and the internal edge publish no host ports. Only the dedicated edge alias joins the existing `kairoseth-public-edge` network.

## Protected bootstrap

The persistent live environment defaults to:

```text
/srv/kairoseth/apps/work-manager/shared/runtime.env
```

The file must be mode `0600` and is never committed.

On first deployment only, the deploy script accepts:

- `KCC_BOOTSTRAP_ADMIN_EMAIL`
- `KCC_BOOTSTRAP_ADMIN_PASSWORD`

It then generates server-side:

- `KCC_LOCAL_AUTH_SECRET`
- `KCC_INTEGRATION_SECRET_KEY`

Subsequent deploys reuse the protected runtime environment and do not rotate credentials implicitly.

## Authentication boundary

The first live reference uses the product's already-validated standalone local-owner authentication. This gives us a real usable instance without making Work Manager depend on Kairoseth Identity.

Kairoseth SSO/OIDC can be promoted later as a separate hardening/integration slice. It is not required to begin dogfooding and must not weaken standalone portability.

## Deployment artifacts

- `deployment/live/docker-compose.yml` — persistent live topology.
- `deployment/live/Caddyfile` — internal Work Manager edge.
- `deployment/live/public-edge-route.caddy` — controlled shared-edge route fragment.
- `deployment/live/deploy-live.sh` — fail-closed deployment/bootstrap/acceptance script.
- `deployment/live/install-shared-edge-route.sh` — guarded shared-edge route installer with backup and Caddy validation.
- `.github/workflows/work-manager-live.yml` — isolated topology acceptance and accepted-main deployment path.

## CI acceptance

Before the live deployment path is accepted, CI must prove:

1. the production Compose file resolves with protected values supplied out-of-band;
2. no service publishes host ports;
3. the shared edge alias is `work-manager-edge`;
4. local authentication remains explicit;
5. the internal Caddyfile is valid;
6. the actual API, worker and web images build;
7. Mongo/API/web become healthy;
8. `/es/login` is reachable through the same shared-edge Docker network used in production;
9. the isolated acceptance stack is removed afterwards.

GitHub-hosted acceptance uses the Mongo 7 compatibility override already established by the Phase 7 infrastructure fix. Product/live default remains Mongo 8.

## Live acceptance

Phase 8 is **not closed** merely because deployment files exist.

The live reference is accepted only when all of the following are observed on the actual Kairoseth runtime:

- [ ] accepted `main` revision deployed;
- [ ] protected runtime environment present with mode `0600`;
- [ ] Mongo, API, worker, web and internal edge healthy;
- [ ] no Work Manager service publishes a host application/database port;
- [ ] shared Kairoseth edge routes `work-manager.kairoseth.com` to `work-manager-edge:80`;
- [ ] public HTTPS `/es/login` returns successfully;
- [ ] public HTTPS `/en/login` returns successfully;
- [ ] owner login works with an HTTP-only session cookie;
- [ ] authenticated Today/dashboard renders persistent data;
- [ ] create/update a real project and task;
- [ ] Quick Capture persists a real item;
- [ ] at least one reminder/recurrence/deadline path is observed in the persistent instance;
- [ ] GitHub integration can be configured without exposing its credential;
- [ ] one Agent Bridge safe operator/history flow is visible if a runtime is enrolled;
- [ ] restart preserves data;
- [ ] backup path is exercised before Phase 8 closure;
- [ ] baseline CPU/RAM/disk/container footprint is captured for commercial cost modelling.

## Out of scope for Phase 8

Phase 8 does not automatically add:

- retry/cancel semantics;
- new automation rule types;
- advanced calendar recurrence;
- new third-party providers;
- public pricing;
- multi-user local identity redesign;
- Kairoseth Identity/OIDC SSO;
- visual dependency graph or forecasting.

Those remain separately scoped future capabilities.

## Security invariants

1. No admin password, auth signing secret or integration encryption key is committed to Git.
2. First-deploy secrets are not echoed by the deploy script.
3. Application/database ports remain unbound on the host.
4. Mongo remains on an internal Docker network.
5. Public traffic reaches Work Manager only through the shared Kairoseth edge and the product's internal edge.
6. The live reference uses the same server-derived tenancy/authorization boundaries as the validated standalone product.
7. Deployment revisions are labelled and checked against the accepted Git revision.
8. Shared-edge mutation is backed up and validated before reload; an invalid route must fail closed.

## Status

**Phase 8: IN PROGRESS.**

Implementation target is not "more features". The target is a real usable Work Manager instance that we can open from Kairoseth and use every day.
