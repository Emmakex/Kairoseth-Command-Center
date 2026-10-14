# 06 — Integrations & automation / Integraciones y automatización

## Integration strategy

Work Manager aggregates useful signals without trying to replace specialist systems. Each connector translates external objects/events into normalized internal resources and timeline/alert events.

Provider models must remain behind adapter boundaries. Core projects/tasks/alerts must not depend directly on GitHub response types, token formats or webhook payloads.

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

The API never accepts a raw workspace/user ID as authorization scope and never persists an arbitrary repository URL supplied by a client.

### Slice 2 — encrypted GitHub connections

PR #16 introduces a credential boundary without making live GitHub calls yet:

- workspace-scoped `IntegrationConnection` records;
- token credentials encrypted with AES-256-GCM before persistence;
- separate `integration_secrets` collection containing ciphertext, IV and authentication tag only;
- `IntegrationConnection.secretRef` is the only credential reference stored in the domain record;
- runtime-only `KCC_INTEGRATION_SECRET_KEY` master key (32 bytes / 64 hex characters);
- workspace ID + secret reference used as authenticated additional data (AAD), preventing ciphertext rebinding across workspace/ref boundaries;
- create/list/rotate/delete connection lifecycle;
- transactional credential rotation/deletion and audit-outbox events;
- deletion blocked while normalized external resources still reference the connection;
- public API responses redact both plaintext credentials and `secretRef`.

`KCC_INTEGRATION_SECRET_KEY` is optional for the core product. When absent, Projects/Tasks and metadata-only repository links continue to work, while credential-backed connection management fails closed with 503. Self-hosted operators therefore control their own provider-encryption key and do not depend on a Kairoseth credential service.

A connection with status `active` in this slice means **configured/enabled locally**. It does not yet prove that GitHub accepts the credential or that any remote repository is reachable. Remote validation belongs to Slice 3.

### Later GitHub slices

After the encrypted connection boundary is merged and green:

1. Live connection validation and manual repository sync.
2. Bind normalized repository links to a validated connection.
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
connectionId = optional until live validation/sync slice
metadata.owner = validated owner
metadata.repository = validated repository
metadata.defaultBranch = optional hint until live sync exists
```

The current link is configuration/metadata only. It does **not** prove that the remote repository exists or that the installation can access it.

Link and unlink mutations write the `external_resources` change and its audit-outbox event in the same MongoDB transaction.

## Credential storage rules

- Plaintext provider credentials exist only at the request boundary and transiently in application memory.
- MongoDB stores encrypted payloads in `integration_secrets`, never plaintext credentials.
- The encryption master key is runtime configuration, not a database/document field.
- API serializers never expose `secretRef`, ciphertext, IV or auth tag.
- Backup archives may contain encrypted secret records but must not contain the runtime master key.
- Losing the master key makes stored integration credentials unreadable; rotation/recovery procedures must therefore preserve the key independently from data backups.

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
- Missing credential-vault configuration disables credential-backed connector actions rather than weakening encryption requirements.

## Customer portability

Connectors are optional packages/configurations. A self-hosted customer may enable only the providers they use and must not need Kairoseth-controlled credentials for generic providers.
