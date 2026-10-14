# 06 — Integrations & automation / Integraciones y automatización

## Integration strategy

Work Manager aggregates useful signals without trying to replace specialist systems. Each connector translates external objects/events into normalized internal resources and timeline/alert events.

Provider models must remain behind adapter boundaries. Core projects/tasks/alerts must not depend directly on GitHub response types, token formats or webhook payloads.

## First connector: GitHub

GitHub is implemented in small releaseable slices rather than one large connector.

### Slice 1 — repository registration/linking

Current Phase 4 work establishes the normalized resource boundary without provider credentials or network calls:

- workspace-only repository registration;
- project ↔ repository linking;
- canonical case-insensitive `owner/repository` identity per workspace;
- server-built GitHub deep link;
- same-workspace project-reference validation;
- `integrations.manage` permission enforcement;
- transactional link/unlink audit-outbox events;
- normalized `ExternalResource` persistence.

The API never accepts a raw workspace/user ID as authorization scope and never persists an arbitrary repository URL supplied by a client.

### Later GitHub slices

After the normalized repository boundary is merged and green:

1. Connection/authentication lifecycle (`IntegrationConnection`) with secret references only.
2. Manual repository validation/sync.
3. Default branch and latest commit normalization.
4. Pull request counts/status.
5. Issue counts/status.
6. Workflow/CI status.
7. Releases/tags where relevant.
8. Verified webhook ingestion for near-real-time updates.
9. Rules/alerts derived from normalized GitHub signals.

Each slice must keep standalone operation possible. Self-hosted customers must be able to configure their own provider credentials without a Kairoseth-controlled credential dependency.

### Example normalized signals

- `repository.ci.failed`
- `repository.pr.opened`
- `repository.pr.stale`
- `repository.issue.created`
- `repository.release.published`

These signals may create/update alerts according to configurable rules only after provider event normalization is implemented.

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

## Current GitHub repository resource rules

A linked repository is represented as:

```text
provider = github
kind = repository
externalId = lower(owner/repository)
displayName = owner/repository
url = server-generated https://github.com/<owner>/<repository>
projectId = same-workspace project
metadata.owner = validated owner
metadata.repository = validated repository
metadata.defaultBranch = optional hint until live sync exists
```

The current link is configuration/metadata only. It does **not** prove that the remote repository exists or that the installation can access it; live validation belongs to the connection/sync slice.

Link and unlink mutations write the `external_resources` change and its audit-outbox event in the same MongoDB transaction.

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

- Webhooks are authenticated/verified before parsing.
- Processing is idempotent.
- Sync jobs are retryable.
- Provider rate limits are respected.
- Connection errors are visible in the UI.
- A failing connector must not break core task/project functionality.
- Repository-link administration remains usable even when live GitHub connectivity is unavailable.

## Customer portability

Connectors are optional packages/configurations. A self-hosted customer may enable only the providers they use and must not need Kairoseth-controlled credentials for generic providers.
