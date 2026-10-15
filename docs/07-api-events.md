# 07 — API & events / API y eventos

## API principles

- Versioned public contract, starting with `/api/v1`.
- JSON over HTTPS for the primary API.
- Explicit workspace context on workspace-scoped operations.
- Idempotency support for external writes and webhook-driven operations.
- Stable error envelope.
- Pagination on collection endpoints.
- Server-side authorization on every protected route.
- Locale affects presentation, never authorization or core semantics.

## Initial resource groups

```text
/api/v1/me
/api/v1/workspaces
/api/v1/projects
/api/v1/milestones
/api/v1/tasks
/api/v1/alerts
/api/v1/decisions
/api/v1/decision-lifecycle
/api/v1/timeline
/api/v1/integrations
/api/v1/webhooks
```

Private resources may use dedicated endpoints or scope filters, but the security boundary remains explicit.

## Decision lifecycle

The validated manual lifecycle is workspace-only and derives the workspace from the authenticated session. Browser and API clients never select a raw workspace identifier.

- `POST /v1/decision-lifecycle` creates an active decision, optionally linked to a project in the same workspace and optionally replacing an active decision from the same workspace.
- `PATCH /v1/decision-lifecycle/:id/reverse` reverses an active decision and requires a reversal reason.

Project references are resolved server-side inside the authenticated workspace. `supersedesId` must identify an active same-workspace decision. Decision state changes and durable audit-outbox records commit in the same MongoDB transaction.

The older `/v1/decisions` create route remains a compatibility surface for simple unlinked decisions. Managed clients use the lifecycle route for project-linked, superseding or reversing operations.

## Operational mutations

Current manual mutation families use the same atomic audit pattern:

- Project create/status and Quick Capture project;
- Task create/status and Quick Capture task;
- Alert create/status;
- simple compatibility Decision creation;
- Milestone create/status, including weighted project-progress recalculation;
- validated Decision create/supersede/reverse lifecycle.

Authentication, workspace/private scope derivation, capability checks and payload validation remain server-side.

## GitHub repository links

Repository configuration routes:

- `GET /v1/integrations/github/repositories`
- `POST /v1/integrations/github/repositories`
- `DELETE /v1/integrations/github/repositories/:resourceId`

They derive workspace from the authenticated session, require `integrations.manage` plus `command-center` entitlement and operate only on normalized `github/repository` resources.

Create accepts `projectId`, `owner`, `repository` and an optional `defaultBranch` hint. Raw workspace/user IDs and arbitrary repository URLs are not authorization or persistence inputs. Repository identity is canonicalized case-insensitively and the GitHub deep link is generated server-side.

## GitHub encrypted connections

Connection routes:

- `GET /v1/integrations/github/connections`
- `POST /v1/integrations/github/connections`
- `PATCH /v1/integrations/github/connections/:id/credential`
- `DELETE /v1/integrations/github/connections/:id`

All routes require an authenticated active workspace, `integrations.manage`, `command-center` entitlement and an available encrypted credential store.

Create accepts:

```json
{
  "displayName": "Primary GitHub",
  "token": "<provider credential>"
}
```

The plaintext token is never part of a response. New connections now return `status: "unverified"` until the provider accepts the credential.

Public connection responses expose only safe normalized fields:

```json
{
  "id": "connection-id",
  "provider": "github",
  "displayName": "Primary GitHub",
  "status": "unverified",
  "credentialConfigured": true,
  "createdAt": "...",
  "updatedAt": "..."
}
```

After successful validation they may additionally contain `lastValidatedAt`, `remoteAccountId` and `remoteAccountLabel`. A normalized `lastErrorCode` may be present after validation failure. `secretRef`, ciphertext, IV, authentication tag and plaintext credentials are internal-only.

Credential encryption uses AES-256-GCM with runtime-only `KCC_INTEGRATION_SECRET_KEY`. Workspace ID and secret reference are authenticated as AAD. Credential rotation returns the connection to `unverified` and clears previous validation metadata.

## GitHub live validation

Slice 3 adds:

- `POST /v1/integrations/github/connections/:id/validate`

The route accepts no provider URL or credential in its body. It resolves the encrypted credential from the same-workspace connection and calls the configured GitHub provider adapter.

Successful validation:

- sets status to `active`;
- records `lastValidatedAt`;
- records normalized remote account ID/label;
- clears `lastErrorCode`;
- emits `integration.github.validation_succeeded` through the audit outbox.

Failed validation:

- stores only a stable normalized error category;
- sets connection status to `error`;
- clears stale remote validation metadata;
- emits `integration.github.validation_failed`;
- never returns the raw provider response body.

Provider error mapping:

- unauthorized/forbidden credential validation → `422 github_connection_invalid_credential`;
- rate limit → `429 github_rate_limited`;
- timeout/upstream failure → `502 github_upstream_unavailable`.

## Repository → connection binding

Slice 3 adds:

- `PATCH /v1/integrations/github/repositories/:resourceId/connection`

Payload:

```json
{
  "connectionId": "connection-id"
}
```

The repository and connection must resolve in the same authenticated workspace. The connection must be `active` **and** have `lastValidatedAt`. This deliberately prevents legacy pre-Slice-3 `active` records from being trusted until they have been validated once.

Successful binding sets `ExternalResource.connectionId` and emits `integration.github.repository_connection_bound` transactionally.

## Manual GitHub repository sync

Slice 3 adds:

- `POST /v1/integrations/github/repositories/:resourceId/sync`

The request carries no token, owner, repository or provider URL. The server:

1. loads the same-workspace normalized repository;
2. requires its validated `connectionId`;
3. resolves/decrypts the connection credential;
4. reads owner/repository from normalized resource metadata;
5. queries the configured GitHub API adapter;
6. fetches repository metadata and latest commit on the provider-reported default branch;
7. persists only normalized fields;
8. commits `repository.sync.completed` through the audit outbox in the same transaction.

Normalized sync metadata includes:

```json
{
  "githubRepositoryId": "1418536661",
  "remoteFullName": "Emmakex/Kairoseth-Command-Center",
  "defaultBranch": "main",
  "latestCommitSha": "...",
  "latestCommitUrl": "...",
  "latestCommitAt": "...",
  "private": false,
  "archived": false,
  "remoteUpdatedAt": "...",
  "lastSyncedAt": "..."
}
```

The existing canonical `externalId = lower(owner/repository)` remains stable during this slice.

Sync failure mapping:

- provider 401 → `422 github_connection_invalid_credential` and the connection is invalidated;
- repository-specific forbidden/not found → `422 github_repository_not_accessible` without automatically invalidating the whole connection;
- rate limit → `429 github_rate_limited`;
- timeout/upstream failure → `502 github_upstream_unavailable`.

A failed sync emits `repository.sync.failed` with a normalized error code only.

## GitHub provider endpoint configuration

`KCC_GITHUB_API_BASE_URL` defaults to `https://api.github.com` and is deployment configuration only. API/browser callers cannot set or override it. The same boundary allows deterministic Docker CI and leaves a controlled path for future GitHub Enterprise support.

## Transactional audit event delivery

`audit_outbox` is an internal persistence contract, not a browser API. Each record contains a normalized Timeline event with stable ID and delivery state (`pending`, `processing`, `delivered`, `failed`).

The worker recovers stale leases, claims pending records, upserts Timeline events idempotently, marks delivery only after persistence and retries failures with bounded backoff.

## Error envelope

Suggested structure:

```json
{
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task not found",
    "requestId": "...",
    "details": {}
  }
}
```

Human-readable messages may be localized; machine-readable error codes remain stable.

## Initial event taxonomy

- `project.created|quick_captured|status_changed`
- `milestone.created|status_changed`
- `task.created|quick_captured|status_changed`
- `alert.created|status_changed`
- `decision.created|superseded|reversed`
- `integration.github.connected|credential_rotated|disconnected`
- `integration.github.validation_succeeded|validation_failed`
- `integration.github.repository_linked|repository_unlinked|repository_connection_bound`
- `repository.sync.completed|failed`
- `membership.created|updated|revoked`

## Webhooks

Outbound webhooks should support per-workspace configuration, signing, subscriptions, retries, delivery logs and safe replay. Inbound provider webhooks remain deferred until provider polling/manual normalization is stable; they must be verified before parsing and normalized before entering domain workflows.

## Compatibility

Breaking API changes require a new major API version or an explicitly documented migration window. Internal implementation details must not become accidental API contracts.
