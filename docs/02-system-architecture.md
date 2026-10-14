# 02 — System architecture / Arquitectura del sistema

## Architecture objective

Kairoseth Command Center must remain portable. Domain logic cannot depend directly on Kairoseth Platform, one cloud provider, one identity provider or one integration vendor.

## Proposed topology

```text
clients
  |
  v
web application
  |
  v
application API
  |
  +--> domain services
  |      |- workspaces
  |      |- projects
  |      |- tasks
  |      |- alerts
  |      |- decisions
  |      |- timeline
  |      `- personal scope
  |
  +--> integration layer
  |      |- GitHub
  |      |- GitLab
  |      |- Calendar
  |      |- Email
  |      |- Jira
  |      `- Webhooks
  |
  +--> auth adapter
  |      |- Kairoseth Identity
  |      |- Local
  |      |- OIDC
  |      `- SAML/Enterprise
  |
  +--> persistence adapter
  |
  `--> worker / scheduler
```

## Suggested repository shape

```text
apps/
  web/
  api/
  worker/
packages/
  domain/
  ui/
  auth/
  integrations/
  contracts/
  config/
deployment/
  kairoseth/
  docker/
  self-hosted/
docs/
```

The final code layout may evolve, but the dependency direction must remain stable: adapters depend on contracts/domain, never the reverse.

## Logical layers

### 1. Domain
Pure business rules: task lifecycle, progress, alert severity, workspace membership, privacy scope, decision history.

### 2. Application
Use cases and orchestration: create task, calculate project health, acknowledge alert, sync repository, generate today view.

### 3. Adapters
Identity, database, Git providers, calendars, email, queues and external APIs.

### 4. Interface
Web UI, public/private API and future embedded SDK.

## Runtime components

- **Web:** responsive application, SSR-capable.
- **API:** stateless application service.
- **Worker:** scheduled sync, webhooks, alert evaluation and background jobs.
- **Database:** initially MongoDB-compatible for Kairoseth alignment, behind repository interfaces.
- **Queue:** optional for MVP locally, required for resilient production integrations.
- **Object storage:** optional for exports/attachments later.

## Kairoseth integration

Inside Kairoseth Platform, Command Center can use Kairoseth Identity, navigation and product entitlements through adapters. The same domain build must run with local/OIDC authentication in customer deployments.

## Architectural invariants

1. No tenant data access without an explicit workspace/tenant boundary.
2. Personal/private objects are scoped to a user independently of organization admin privileges.
3. External system payloads are normalized before entering the domain.
4. All integration writes are idempotent where possible.
5. Background jobs must be retryable and observable.
6. ES/EN is a platform concern from the first UI implementation.
