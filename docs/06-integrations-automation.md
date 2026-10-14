# 06 — Integrations & automation / Integraciones y automatización

## Integration strategy

Command Center aggregates useful signals without trying to replace specialist systems. Each connector translates external objects/events into normalized internal resources and timeline/alert events.

## First connector: GitHub

Initial GitHub capabilities should include:

- repository registration/linking to projects;
- default branch and latest commit;
- pull request counts/status;
- issue counts/status;
- workflow/CI status;
- releases/tags when relevant;
- webhook ingestion for near-real-time updates;
- manual sync fallback;
- deep links back to GitHub.

### Example normalized signals

- `repository.ci.failed`
- `repository.pr.opened`
- `repository.pr.stale`
- `repository.issue.created`
- `repository.release.published`

These signals may create/update alerts according to configurable rules.

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

External provider models must not leak into core domain types.

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

Rules require:

- trigger;
- optional conditions;
- action;
- scope;
- cooldown/deduplication;
- audit record.

## AI layer

AI may assist with:

- quick-capture parsing;
- prioritization suggestions;
- daily summaries;
- explaining why something is urgent;
- grouping duplicate/related signals;
- extracting candidate decisions from activity.

AI must not silently change permissions, delete external data, merge code, send messages or execute other high-impact actions without an explicit product policy and user authorization.

## Reliability

- Webhooks are authenticated/verified.
- Processing is idempotent.
- Sync jobs are retryable.
- Provider rate limits are respected.
- Connection errors are visible in the UI.
- A failing connector must not break core task/project functionality.

## Customer portability

Connectors are optional packages/configurations. A self-hosted customer may enable only the providers they use and must not need Kairoseth-controlled credentials for generic providers.
