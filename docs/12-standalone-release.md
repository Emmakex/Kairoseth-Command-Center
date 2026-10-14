# 12 — Standalone release / Release standalone

## Product naming

- **ES:** Gestor de Trabajo
- **EN:** Work Manager
- `Kairoseth Command Center` remains the technical/internal repository name only.

## Purpose

This document defines the minimum release boundary for a standalone customer installation. Passing unit tests alone is not enough: the production-oriented stack must start from explicit configuration, remain private by default, exercise real authentication and persistence, and prove backup/restore recovery.

## Profiles

### Development / CI

`docker-compose.yml` is the developer-friendly stack. It may expose development ports and must not be treated as the customer production profile.

### Standalone production-oriented

`docker-compose.standalone.yml` is the customer-oriented baseline:

- `NODE_ENV=production` for API, worker and web;
- local authentication enabled explicitly;
- owner email, owner password and signing secret are required and fail closed when missing/empty;
- MongoDB is not published to the host;
- API binds only to `127.0.0.1` on the host;
- web binds to `127.0.0.1` by default;
- backend Docker network is internal;
- services restart unless stopped;
- API has a readiness healthcheck;
- persistent MongoDB data uses a named volume.

Remote customer access should be terminated by a TLS reverse proxy in front of the web port. Do not expose MongoDB to the public network.

## First installation

```bash
cp .env.standalone.example .env.standalone
```

Set at minimum:

```text
KCC_LOCAL_ADMIN_EMAIL
KCC_LOCAL_ADMIN_PASSWORD
KCC_LOCAL_AUTH_SECRET
```

Generate a signing secret with a cryptographically secure random source, e.g.:

```bash
openssl rand -hex 32
```

Validate before starting:

```bash
docker compose --env-file .env.standalone -f docker-compose.standalone.yml config
```

Start:

```bash
docker compose --env-file .env.standalone -f docker-compose.standalone.yml up -d --build
```

Inspect:

```bash
docker compose --env-file .env.standalone -f docker-compose.standalone.yml ps
```

## Release gate

Run:

```bash
KCC_SMOKE_RUN_ID=manual bash deployment/docker/smoke-standalone-release.sh
```

The gate proves, end-to-end:

1. required environment configuration parses successfully;
2. the production-oriented Docker stack builds and starts;
3. API readiness succeeds;
4. ES and EN web routes respond;
5. MongoDB has no published host port;
6. bootstrap owner authenticates;
7. owner can create a member;
8. member authenticates but cannot administer identities;
9. owner protection is enforced;
10. member password change invalidates the previous bearer token;
11. old password no longer authenticates and new password does;
12. a MongoDB backup is produced with SHA-256 checksum;
13. the backup restores into the ephemeral stack;
14. the persisted owner still authenticates after restore.

GitHub Actions runs the same lifecycle through `Standalone release gate` on pull requests and `main`.

## Backup

Default:

```bash
bash deployment/docker/backup-standalone.sh
```

The helper writes a compressed Mongo archive and adjacent `.sha256` file. Override destination by passing a path as the first argument.

A production operator must copy backups off the application host according to the customer's retention/RPO policy. A local archive on the same disk is not a complete backup strategy.

## Restore

Restore is destructive for the application database and therefore requires an explicit acknowledgement:

```bash
KCC_RESTORE_CONFIRM=RESTORE \
  bash deployment/docker/restore-standalone.sh backups/<file>.archive.gz
```

If a matching checksum file exists, it is verified before restore.

Before a real restore:

1. take a fresh backup when possible;
2. verify the intended archive/checksum;
3. schedule customer downtime if required;
4. stop external writes;
5. restore;
6. authenticate and verify representative workspace/private data;
7. verify worker/outbox processing returns healthy.

## Reverse proxy / TLS

The repository intentionally does not prescribe one proxy vendor. The operator may use Caddy, Nginx, Traefik or an enterprise ingress, but must provide HTTPS for remote access and forward only the web surface unless there is an explicit reason to expose the API.

## Release decision

Phase 3 standalone is considered technically releasable only when all of these are green on the same final commit:

- normal CI (lint, typecheck, tests, build, dependency audit, secrets, transactional Docker smoke);
- persistent local identity Docker smoke;
- standalone production-profile release gate.

Commercial publication is a separate step. The web/catalog entry should use **Gestor de Trabajo / Work Manager**, not the internal repository name.
