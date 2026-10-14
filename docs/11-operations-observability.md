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
