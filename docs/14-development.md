# 14 — Development / Desarrollo local

## Requirements / Requisitos

- Node.js 22+
- pnpm 10+
- Docker + Docker Compose for the full local stack
- MongoDB replica-set mode for transactional audit mutations

## Workspace

```text
apps/
  web/       Next.js interface
  api/       Fastify API
  worker/    background worker / audit outbox delivery
packages/
  auth/          authentication provider contracts
  config/        validated runtime configuration
  contracts/     API/event contracts
  domain/        pure business types/rules
  integrations/  normalized integration contracts
  persistence/   Mongo persistence + durable audit outbox
  ui/            shared UI primitives
```

## Install

```bash
corepack enable
pnpm install
cp .env.example .env
```

## Development without containers

Start MongoDB in replica-set mode, initialize the replica set, then:

```bash
pnpm dev
```

For a local single-node replica set, use a MongoDB URI equivalent to:

```text
mongodb://localhost:27017/kairoseth_command_center?replicaSet=rs0&directConnection=true
```

The root command builds shared packages first and starts web, API and worker in parallel.

Default endpoints:

- Web: `http://localhost:3000/es` and `/en`
- API liveness: `http://localhost:4000/health`
- API readiness: `http://localhost:4000/ready`
- MongoDB: port `27017`, replica set `rs0` in the Docker stack

## Full local stack

```bash
docker compose up --build
```

The stack contains MongoDB, API, worker and web. Docker starts MongoDB as a single-node `rs0` replica set so transactions are available in the same portable stack used by CI. MongoDB health is part of API readiness.

The worker drains `audit_outbox` records and materializes idempotent `timeline_events`. Its Docker default poll interval is five seconds.

## Quality gate

Run before opening or merging a pull request:

```bash
pnpm ci
```

This executes lint, TypeScript validation, tests and production builds. GitHub Actions additionally runs dependency and secret checks. Docker smoke verifies API/web readiness, replica-set readiness and an end-to-end audit outbox delivery.

## Architecture rules

1. Domain code must not import Kairoseth Platform, MongoDB, GitHub or other adapters.
2. Tenant/workspace scope must be explicit before persistence access is introduced.
3. Private user data must remain independent from organization-admin privileges.
4. Integrations emit normalized signals; raw vendor payloads do not enter the domain directly.
5. ES/EN support is required for every user-facing feature from its first implementation.
6. A mutation covered by transactional audit hardening must write domain state and its outbox records in the same MongoDB transaction.
7. Worker delivery into Timeline must be idempotent and safe to retry.

## Phase 1 definition of done

Phase 1 is complete only when:

- clean install works;
- `pnpm ci` is green;
- `docker compose up --build` is reproducible;
- `/health` and `/ready` behave correctly;
- ES and EN routes build successfully;
- the monorepo package boundaries remain portable.
