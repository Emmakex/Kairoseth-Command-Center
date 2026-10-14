# 11 — Operations & observability / Operaciones y observabilidad

## Goals

- Detect failures before users report them.
- Make connector/sync health visible.
- Support safe upgrades and rollback.
- Keep operational telemetry useful without exposing private content.

## Health endpoints

At minimum:

- liveness;
- readiness;
- database connectivity;
- worker heartbeat;
- queue health where enabled;
- connector status summary without secrets.

## Transactional audit outbox

Mutations that require durable Timeline/audit consistency use a transactional outbox pattern:

1. the domain state change and one or more `audit_outbox` records are written in the same MongoDB transaction;
2. the worker claims pending records with a lease;
3. the Timeline event is inserted idempotently using the event ID as a unique key;
4. the outbox record is marked `delivered` only after Timeline persistence succeeds;
5. failed deliveries return to `pending` with bounded backoff and become `failed` after the configured attempt ceiling;
6. stale `processing` leases are recoverable after worker interruption.

The current Phase 3 manual mutation families use this model: Project, Task, Alert, Quick Capture, simple Decision creation, Milestone create/status and validated Decision create/supersede/reverse. Milestone progress recalculation is included inside the same transaction as the Milestone state change and audit record.

MongoDB deployments that execute transactional mutations must run as a replica set. The portable Docker stack uses a single-node `rs0` replica set; managed/production deployments may use a multi-node replica set according to their availability requirements.

The worker logs `audit_outbox.tick` with claimed, delivered and failed counts. These fields are operational telemetry and must not contain private task/decision bodies.

The CI Docker gate exercises both workspace and private scopes: it performs a real Decision lifecycle mutation and a private Quick Capture mutation, then waits for their Timeline events to be delivered by the worker and verifies the corresponding outbox records reach `delivered`.

## Persistent standalone identity smoke

A reusable Docker smoke is provided at:

```text
deployment/docker/smoke-local-identities.sh
```

It runs against a live API/DB stack and verifies the full standalone multi-user lifecycle:

1. authenticate the persisted bootstrap owner;
2. create a real `member` through the protected member-management API;
3. authenticate the new member;
4. prove the member receives `403 forbidden` when attempting member administration;
5. prove the owner cannot be demoted through member-management routes;
6. change the member password through the authenticated self-service route;
7. prove the pre-change bearer token becomes invalid immediately;
8. prove the old password no longer authenticates;
9. authenticate with the new password and resolve a fresh session.

The dedicated `Local identities smoke` GitHub Actions workflow starts the portable Docker stack and runs this script on pull requests and on `main`, independently of the general CI workflow. This keeps the multi-user release gate explicit and avoids mixing identity lifecycle checks into the transactional-audit smoke.

The smoke requires `KCC_LOCAL_ADMIN_EMAIL` and `KCC_LOCAL_ADMIN_PASSWORD`; optional `KCC_API_BASE_URL` and `KCC_SMOKE_RUN_ID` can override the default API endpoint and unique test identity suffix. Test credentials are generated for the ephemeral CI stack and must never be reused as production credentials.

## Structured logging

Logs should include stable operational fields such as:

- request/job ID;
- user/workspace identifiers where appropriate;
- component;
- event type;
- duration;
- outcome;
- provider/integration name.

Do not log passwords, tokens, private task bodies or raw secret values.

## Metrics

Initial metrics:

- API latency/error rate;
- authentication failures;
- background job success/failure/retry;
- connector sync duration;
- webhook delivery/processing failures;
- open alerts by severity;
- database latency;
- audit outbox pending/failed depth;
- queue depth when applicable.

## Tracing

Request/job correlation IDs should flow from API to worker/integration operations. Distributed tracing can be enabled in production deployments when useful.

## CI/CD baseline

Every change should run:

1. formatting/lint;
2. type checks;
3. unit tests;
4. authorization/security-focused tests;
5. integration/contract tests where available;
6. build;
7. dependency/secret scanning.

The Docker quality gates also verify:

- local MongoDB replica-set readiness;
- end-to-end outbox-to-Timeline delivery through the worker for workspace and private mutation paths;
- persistent standalone owner/member authentication and authorization;
- password-change token invalidation.

Main must remain releasable. Failed verification blocks release.

## Environments

Recommended:

- local;
- test/CI;
- staging;
- production.

Self-hosted artifacts must not embed environment-specific customer configuration.

## Backups

Document and test:

- database backup;
- restore procedure;
- configuration metadata backup;
- encryption key/secret recovery responsibility;
- recovery point/recovery time targets by edition.

## Migrations

Schema/data migrations must be versioned and repeatable. Release notes state required migration steps and compatibility.

## Feature flags

Use flags for risky or edition-specific capabilities, not as a substitute for authorization. Flags should be auditable/configurable and have a retirement plan.

## Incident readiness

Production operations should define:

- severity levels;
- owner/escalation path;
- connector degradation behavior;
- rollback procedure;
- customer communication expectations;
- post-incident record for significant failures.
