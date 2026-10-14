# Gestor de Trabajo / Work Manager

**Technical/internal repository:** `Kairoseth-Command-Center`  
**Category:** Kairoseth Software  
**Status:** Phase 3 standalone release candidate  
**Languages:** ES / EN

**Gestor de Trabajo** (ES) / **Work Manager** (EN) centraliza proyectos, tareas, alertas, hitos, decisiones, actividad y organización privada en una única superficie operativa. El producto está diseñado para funcionar como software autónomo y portable, además de poder integrarse en Kairoseth Platform.

`Kairoseth Command Center` is the technical/internal project name only. The commercial product names are **Gestor de Trabajo** and **Work Manager**; public product names do not use `Kairoseth` as a prefix.

## Current capabilities / Capacidades actuales

- Projects and weighted Milestones.
- Tasks and Quick Capture.
- Alerts and lifecycle actions.
- Validated Decision Log with supersede/reverse lifecycle.
- Workspace/private scopes enforced server-side.
- Timeline/audit activity backed by a transactional outbox.
- Persistent standalone multi-user identities.
- Owner/admin/member roles with capability enforcement.
- Password change/reset with immediate stale-session invalidation.
- ES/EN web interface.
- Docker deployment for development and a separate hardened standalone profile.

## Standalone deployment / Despliegue standalone

Requirements: Docker Engine with Docker Compose v2.

1. Create the standalone environment file:

```bash
cp .env.standalone.example .env.standalone
```

2. Set the required empty values `KCC_LOCAL_ADMIN_EMAIL`, `KCC_LOCAL_ADMIN_PASSWORD` and `KCC_LOCAL_AUTH_SECRET`. Generate a long random signing secret, for example:

```bash
openssl rand -hex 32
```

3. Validate and start the production-oriented profile:

```bash
docker compose --env-file .env.standalone -f docker-compose.standalone.yml config
docker compose --env-file .env.standalone -f docker-compose.standalone.yml up -d --build
```

4. Open `http://127.0.0.1:3000/es` or `http://127.0.0.1:3000/en` on the host.

The standalone profile binds Web and API to loopback by default and does **not** publish MongoDB. For remote access, keep the default loopback binding and place a TLS reverse proxy in front of the web service. Do not expose MongoDB publicly.

The compose file fails closed when the local owner email, password or signing secret are missing.

## Backup / Restore

Create a database backup with checksum:

```bash
bash deployment/docker/backup-standalone.sh
```

Restore requires an explicit destructive-operation confirmation:

```bash
KCC_RESTORE_CONFIRM=RESTORE \
  bash deployment/docker/restore-standalone.sh backups/<backup>.archive.gz
```

Always test restore procedures before relying on a backup policy in production.

## Release smoke

The complete standalone release gate builds the production-oriented profile, verifies ES/EN routes, runs the persistent multi-user identity lifecycle, checks that MongoDB is not published, creates/verifies a backup, restores it and validates authentication afterwards:

```bash
KCC_SMOKE_RUN_ID=manual \
  bash deployment/docker/smoke-standalone-release.sh
```

The `Standalone release gate` GitHub Actions workflow runs the same path with ephemeral credentials.

## Development

The existing `docker-compose.yml` remains the development/CI-oriented stack. It intentionally keeps developer-friendly ports and settings separate from the standalone production-oriented profile.

```bash
docker compose up -d --build
```

## Product principles / Principios

- **Portable by design:** shared cloud, private cloud and self-hosted/on-premise.
- **Multi-tenant:** strict workspace isolation.
- **User-private scope:** personal items remain private to the authenticated user.
- **Role-aware:** authorization is resolved server-side.
- **Integration-first:** GitHub is the first planned external integration after the standalone Phase 3 release boundary is green.
- **AI-assisted, not AI-dependent:** core correctness remains deterministic.
- **ES/EN from day one.**

## Documentation

Start with [`docs/00-product-definition.md`](docs/00-product-definition.md). The complete documentation map is in [`docs/README.md`](docs/README.md).

Security guidance is in [`SECURITY.md`](SECURITY.md) and [`docs/08-security-privacy.md`](docs/08-security-privacy.md). Operational guidance is in [`docs/11-operations-observability.md`](docs/11-operations-observability.md).

---

© Kairoseth / Emmake. Licensing model to be defined before public commercial release.
