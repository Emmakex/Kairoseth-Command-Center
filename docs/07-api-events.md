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

The older `/v1/decisions` create route remains a compatibility surface during Phase 3 cleanup. New managed clients must use the lifecycle route for project-linked, superseding or reversing operations. Transaction/outbox hardening remains required before Phase 3 closes so multi-write Decision + Timeline operations become atomic/recoverable.

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
  "type": "task.completed",
  "occurredAt": "2026-10-14T08:00:00Z",
  "workspaceId": "ws_...",
  "actor": {"type": "user", "id": "usr_..."},
  "source": "command-center",
  "subject": {"type": "task", "id": "tsk_..."},
  "data": {}
}
```

## Initial event taxonomy

- `project.created|updated|archived`
- `milestone.completed`
- `task.created|updated|blocked|completed`
- `alert.opened|acknowledged|resolved`
- `decision.created|superseded|reversed`
- `integration.connected|degraded|disconnected`
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
