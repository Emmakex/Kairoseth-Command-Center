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

Private resources may use dedicated endpoints or scope filters, but the security boundary must remain explicit.

## Decision lifecycle

The validated manual lifecycle is workspace-only and derives the workspace from the authenticated session. Browser and API clients never select a raw workspace identifier.

- `POST /v1/decision-lifecycle` creates an active decision, optionally linked to a project in the same workspace and optionally replacing an active decision from the same workspace.
- `PATCH /v1/decision-lifecycle/:id/reverse` reverses an active decision and requires a reversal reason.

Project references are resolved server-side inside the authenticated workspace. `supersedesId` must identify an active same-workspace decision. Lifecycle updates use conditional `active` transitions so repeated or racing terminal transitions fail rather than silently overwriting history.

Decision lifecycle mutations are transactionally audited: Decision state changes and durable audit-outbox records are committed in the same MongoDB transaction. The worker later materializes those events in `timeline_events` idempotently. A successful API mutation therefore cannot commit without also persisting the audit work needed to reconstruct its Timeline activity.

The older `/v1/decisions` create route remains a compatibility surface for simple unlinked decisions. It rejects `projectId` and `supersedesId`; managed clients must use the lifecycle route for project-linked, superseding or reversing operations.

## Operational mutations

The current manual mutation families use the same atomic audit pattern without changing their public URLs or response shapes:

- Project create/status and Quick Capture project;
- Task create/status and Quick Capture task;
- Alert create/status;
- simple compatibility Decision creation;
- Milestone create/status, including weighted project-progress recalculation;
- validated Decision create/supersede/reverse lifecycle.

Authentication, workspace/private scope derivation, capability checks and payload validation remain server-side. The atomic route interceptor is allowlisted to the known mutation paths and returns the final response itself, so the legacy mutation handler cannot execute a second domain write after a successful atomic mutation.

Milestone state and the resulting project progress are updated in the same transaction as the audit outbox record. Private Quick Capture keeps private-user scope and the `task.quick_captured` / `project.quick_captured` event semantics.

## GitHub repository links

Phase 4 Slice 1 is metadata-only and does not require GitHub credentials or a live GitHub API call.

Routes:

- `GET /v1/integrations/github/repositories`
- `POST /v1/integrations/github/repositories`
- `DELETE /v1/integrations/github/repositories/:resourceId`

All routes derive the workspace from the authenticated session, require `integrations.manage` plus the `command-center` entitlement and operate only on normalized provider `github`, kind `repository` resources.

Create accepts `projectId`, `owner`, `repository` and an optional `defaultBranch` hint. Raw workspace/user IDs and arbitrary repository URLs are not authorization or persistence inputs. Repository identity is canonicalized case-insensitively and the GitHub deep link is generated server-side.

Link/unlink state and audit-outbox events are committed in the same MongoDB transaction. This slice does not prove that the remote repository exists.

## GitHub connections and encrypted credentials

Phase 4 Slice 2 adds a local credential lifecycle without live provider validation.

Routes:

- `GET /v1/integrations/github/connections`
- `POST /v1/integrations/github/connections`
- `PATCH /v1/integrations/github/connections/:id/credential`
- `DELETE /v1/integrations/github/connections/:id`

All routes:

- require an authenticated active workspace;
- derive the workspace exclusively from the server-side session;
- require `integrations.manage` plus the `command-center` product entitlement;
- fail closed with `503 github_connection_store_unavailable` when the encrypted vault is not configured.

Create accepts:

```json
{
  "displayName": "Primary GitHub",
  "token": "<provider credential>"
}
```

The plaintext token is never part of a response. Public connection responses contain only:

```json
{
  "id": "connection-id",
  "provider": "github",
  "displayName": "Primary GitHub",
  "status": "active",
  "credentialConfigured": true,
  "createdAt": "...",
  "updatedAt": "..."
}
```

`secretRef`, ciphertext, IV and authentication tag are internal-only fields. The domain `IntegrationConnection` stores a `secretRef`; encrypted secret material lives in the separate `integration_secrets` collection.

Credential encryption uses AES-256-GCM with a runtime-only `KCC_INTEGRATION_SECRET_KEY` (64 hexadecimal characters). Workspace ID and secret reference are authenticated as AAD. This prevents a ciphertext record copied under a different workspace/ref from being accepted during decryption.

Credential rotation replaces the encrypted payload under the same secret reference and commits the audit-outbox record in the same MongoDB transaction. Connection deletion removes the connection and encrypted secret atomically. Deletion returns `409 github_connection_in_use` when an `ExternalResource.connectionId` still references that connection.

Connection status `active` in this slice means configured/enabled locally; it does not yet assert that GitHub accepted the token. Live provider validation is a later slice.

## Transactional audit event delivery

`audit_outbox` is an internal persistence contract, not a browser API. Each record contains a fully normalized Timeline event with a stable event ID plus delivery state (`pending`, `processing`, `delivered`, `failed`).

The worker:

1. recovers stale processing leases;
2. claims pending records atomically;
3. upserts the Timeline event by event ID;
4. marks the outbox record delivered only after successful Timeline persistence;
5. retries failures with bounded backoff.

This means duplicate worker execution is safe and worker interruption does not lose a committed audit event.

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

## Event model

Internal events should follow a normalized envelope:

```json
{
  "id": "evt_...",
  "type": "task.status_changed",
  "occurredAt": "2026-10-14T08:00:00Z",
  "workspaceId": "ws_...",
  "actor": {"type": "user", "id": "usr_..."},
  "source": "command-center",
  "subject": {"type": "task", "id": "tsk_..."},
  "data": {}
}
```

## Initial event taxonomy

- `project.created|quick_captured|status_changed`
- `milestone.created|status_changed`
- `task.created|quick_captured|status_changed`
- `alert.created|status_changed`
- `decision.created|superseded|reversed`
- `integration.github.connected|credential_rotated|disconnected`
- `integration.github.repository_linked|repository_unlinked`
- `repository.sync.completed|failed`
- `membership.created|updated|revoked`

## Webhooks

Outbound webhooks should support:

- per-workspace configuration;
- signing secret;
- event subscriptions;
- retries with backoff;
- delivery log;
- replay from the UI/API where safe.

Inbound provider webhooks are verified before parsing and are converted to normalized events before entering domain workflows.

## Compatibility

Breaking API changes require a new major API version or an explicitly documented migration window. Internal implementation details must not become accidental API contracts.
