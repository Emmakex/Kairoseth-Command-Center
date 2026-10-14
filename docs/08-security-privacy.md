# 08 — Security & privacy / Seguridad y privacidad

## Security goals

1. Prevent cross-tenant access.
2. Preserve user-private information independently of workspace administration.
3. Minimize connector permissions and stored secrets.
4. Make sensitive changes auditable.
5. Keep self-hosted deployments operable without hidden Kairoseth dependencies.

## Mandatory controls

### Tenant isolation
- Workspace/tenant scope enforced in service/repository queries.
- Authorization cannot rely on client-side filtering.
- Object IDs alone are never sufficient for access.
- Automated tests must include cross-tenant negative cases.

### Private scope
Personal/private objects require owner-user authorization. A workspace owner/admin does not inherit read access to private content.

### Secrets
- Never commit credentials.
- Never log tokens, passwords or raw secret values.
- Store secrets in platform/environment secret management.
- Domain records store secret references/connection metadata only.
- Rotate/revoke connector credentials without deleting business data.

### Authentication/session
- Secure cookies or standards-based bearer handling depending on deployment.
- CSRF protection where cookie sessions are used.
- Short-lived access/session strategy with revocation support.
- Brute-force/rate-limit protections.
- MFA/SSO compatibility.

### Authorization
- Deny by default.
- Capability checks on server actions.
- Platform-admin privileges never inferred from customer-admin roles.
- Product entitlement and role are separate checks.

### Webhooks
- Signature/token verification.
- Timestamp/replay protection where provider supports it.
- Payload size limits.
- Idempotency/deduplication.

## Data minimization

Only ingest provider data needed for the enabled feature. Prefer metadata and deep links over duplicating entire third-party systems.

## Logging & privacy

Operational logs should use IDs and structured metadata instead of sensitive content when possible. Private task/reminder bodies should not be written to general application logs.

## Audit trail

Audit at minimum:

- membership/role changes;
- entitlement changes;
- integration connect/disconnect;
- secret rotation events without exposing secret value;
- exports/deletions;
- security-sensitive configuration changes.

## Customer deployment

Self-hosted customers control their runtime, database, backups and configured connector endpoints. Telemetry must be documented and configurable; private deployments should support disabling non-essential outbound telemetry.

## Security lifecycle

Before stable release:

- threat model;
- dependency scanning;
- SAST/lint/security checks in CI;
- secret scanning;
- authorization integration tests;
- webhook verification tests;
- dependency update policy;
- vulnerability reporting process in `SECURITY.md`.

## Privacy principle

The product should make the difference between **private**, **workspace shared** and **system-generated** information visible in the UI so users understand the audience of what they create.
