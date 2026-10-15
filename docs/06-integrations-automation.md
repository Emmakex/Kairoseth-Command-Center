# 06 — Integrations & automation / Integraciones y automatización

## Integration strategy

Work Manager aggregates useful signals without trying to replace specialist systems. Each connector translates external objects/events into normalized internal resources and timeline/alert events.

Provider models stay behind adapter boundaries. Core projects/tasks/alerts do not depend directly on GitHub response types, credential formats or webhook payloads.

## First connector: GitHub

GitHub is implemented in small releaseable slices rather than one large connector.

### Slice 1 — repository registration/linking

Merged and post-merge validated in PR #15:

- workspace-only repository registration;
- project ↔ repository linking;
- canonical case-insensitive `owner/repository` identity per workspace;
- server-built GitHub deep link;
- same-workspace project-reference validation;
- `integrations.manage` permission enforcement;
- transactional link/unlink audit-outbox events;
- normalized `ExternalResource` persistence.

### Slice 2 — encrypted GitHub connections

Merged and post-merge validated in PR #16:

- workspace-scoped `IntegrationConnection` records;
- provider credentials encrypted with AES-256-GCM before persistence;
- separate `integration_secrets` collection containing ciphertext, IV and authentication tag only;
- `IntegrationConnection.secretRef` is the only credential reference stored in the domain record;
- runtime-only `KCC_INTEGRATION_SECRET_KEY` master key;
- workspace ID + secret reference used as authenticated additional data (AAD);
- create/list/rotate/delete connection lifecycle;
- transactional credential rotation/deletion and audit-outbox events;
- deletion blocked while normalized resources still reference the connection;
- public API responses redact plaintext credentials and `secretRef`.

`KCC_INTEGRATION_SECRET_KEY` remains optional for the core product. When absent, core Work Manager functionality and metadata-only repository links continue to work while credential-backed integration operations fail closed.

### Slice 3 — live validation and manual repository sync

PR #17 adds the first real GitHub provider calls while preserving the normalized boundary.

Connection lifecycle:

- new and rotated credentials are `unverified`;
- `POST /v1/integrations/github/connections/:id/validate` resolves the encrypted credential server-side and calls the trusted provider adapter;
- successful validation promotes the connection to `active` and records `lastValidatedAt`, `remoteAccountId` and `remoteAccountLabel`;
- normalized validation failures move the connection to `error` with `lastErrorCode`;
- an older `active` record without `lastValidatedAt` is not eligible for repository binding until it is validated once.

Repository lifecycle:

- a normalized repository is explicitly bound to a validated same-workspace connection;
- `PATCH /v1/integrations/github/repositories/:resourceId/connection` performs the binding;
- `POST /v1/integrations/github/repositories/:resourceId/sync` performs a manual provider sync;
- the sync request does not accept token, owner, repository or arbitrary upstream URL;
- resource coordinates come from the already-normalized `ExternalResource` and the credential comes from its bound `IntegrationConnection`.

The manual sync stores only normalized provider facts:

```text
metadata.githubRepositoryId
metadata.remoteFullName
metadata.defaultBranch
metadata.latestCommitSha
metadata.latestCommitUrl?
metadata.latestCommitAt?
metadata.private
metadata.archived
metadata.remoteUpdatedAt?
metadata.lastSyncedAt
```

The stable local `externalId = lower(owner/repository)` is not replaced by the provider numeric ID during this slice. This preserves the existing repository-link identity while keeping the provider ID available for later ingestion work.

### GitHub provider adapter

`GitHubRestClient` is the only live HTTP boundary in Slice 3. It provides:

- `validateCredential()`;
- `getRepository()`;
- `getLatestCommit()`;
- bearer authentication;
- request timeout;
- redirect rejection;
- provider response normalization;
- stable error categories: unauthorized, forbidden, not found, rate limited, timeout and upstream error.

The default provider endpoint is `https://api.github.com`. `KCC_GITHUB_API_BASE_URL` is deployment configuration, not request input. This supports controlled testing and a future GitHub Enterprise deployment path without allowing browser/API clients to choose arbitrary upstream hosts.

### Failure semantics

- provider 401 during validation → connection `error`;
- provider 401 during repository sync → connection is invalidated because the credential itself is no longer accepted;
- repository-specific 403/404 → sync fails but the whole credential is not automatically invalidated;
- rate limit → stable 429 response;
- timeout/upstream failure → stable 502 response;
- raw provider response bodies and credentials are never returned to clients or stored in audit metadata.

Validation, binding and sync events use the existing audit outbox:

- `integration.github.validation_succeeded`
- `integration.github.validation_failed`
- `integration.github.repository_connection_bound`
- `repository.sync.completed`
- `repository.sync.failed`

### CI provider mock

Slice 3 includes a strict HTTP GitHub mock used only by Docker CI. It validates the bearer header and serves deterministic `/user`, repository and commit responses. The dedicated smoke validates the real API/container/Mongo/outbox path without requiring a real GitHub credential or external network dependency.

## Later GitHub slices

After Slice 3 is merged and green:

1. Pull request normalization and status/count signals.
2. Issue normalization and status/count signals.
3. Workflow/CI status normalization.
4. Release/tag normalization.
5. Scheduled/retryable sync and rate-limit-aware backoff.
6. Verified webhook ingestion for near-real-time updates.
7. Rules/alerts derived from normalized GitHub signals.
8. OAuth/GitHub App authorization flow once the token-backed adapter boundary is proven.

Each slice must keep standalone operation possible. Self-hosted customers control their own credentials and encryption key without depending on a Kairoseth credential service.

### Example normalized signals

- `repository.ci.failed`
- `repository.pr.opened`
- `repository.pr.stale`
- `repository.issue.created`
- `repository.release.published`

These signals may create/update alerts only after their provider data has been normalized.

## Connector contract

Every integration should provide a subset of:

- `connect()` / authorization flow;
- `validateConnection()`;
- `sync()`;
- `handleWebhook()`;
- `normalizeResource()`;
- `normalizeEvent()`;
- `disconnect()`;
- health/last-sync metadata.

External provider models must not leak into core domain types. `IntegrationConnection` owns connector configuration references; `ExternalResource` owns normalized external object references.

## Credential storage rules

- Plaintext provider credentials exist only at the request boundary and transiently in application memory.
- MongoDB stores encrypted payloads in `integration_secrets`, never plaintext credentials.
- The encryption master key is runtime configuration, not a database/document field.
- API serializers never expose `secretRef`, ciphertext, IV or auth tag.
- Backup archives may contain encrypted secret records but must not contain the runtime master key.
- Losing the master key makes stored integration credentials unreadable; preserve it independently from data backups.

## Planned connectors

1. GitHub.
2. GitLab.
3. Google Calendar / Microsoft Calendar.
4. Gmail / Microsoft 365 mail metadata and actionable follow-ups.
5. Jira/Linear-style issue trackers.
6. Slack/Teams notifications.
7. Generic inbound/outbound webhooks.
8. Kairoseth product adapters.

## Automation engine

Automation should be rule-driven before becoming agent-driven.

Example:

```text
WHEN github.workflow == failed
AND project.status != archived
THEN upsert alert severity=important
AND attach project/repository context
```

Rules require trigger, optional conditions, action, scope, cooldown/deduplication and an audit record.

## AI layer

AI may assist with quick-capture parsing, prioritization suggestions, daily summaries, urgency explanations, grouping related signals and extracting candidate decisions. AI must not silently change permissions, delete external data, merge code, send messages or execute other high-impact actions without explicit product policy and user authorization.

## Reliability

- Webhooks are authenticated/verified before parsing.
- Processing is idempotent.
- Future scheduled sync jobs are retryable and rate-limit aware.
- Connection errors remain visible without breaking core project/task functionality.
- Repository-link administration remains usable when live GitHub connectivity is unavailable.
- Missing credential-vault configuration disables credential-backed actions rather than weakening encryption requirements.

## Customer portability

Connectors are optional packages/configurations. A self-hosted customer may enable only the providers they use and must not need Kairoseth-controlled credentials for generic providers.
