# 27 — Stale work rules / Reglas de trabajo sin actividad

## Goal / Objetivo

Extend the proven Phase 5 rule engine from CI-only alerts to normalized pull-request and issue signals without introducing arbitrary executable rule logic.  
Extender el motor probado de reglas de la Fase 5 desde alertas de CI a señales normalizadas de pull requests e issues sin introducir lógica ejecutable arbitraria.

## Phase 5 Slice 3 scope / Alcance de Slice 3

Two deterministic built-in rules are added:

- `repository.pull_request.stale.v1`
- `repository.issue.stale.v1`

Both rules:

- consume only durable normalized integration signals;
- use a fixed v1 inactivity threshold of **7 days**;
- default to **disabled** so existing installations do not receive new alerts without opting in;
- default to `warning` severity when enabled;
- reuse the existing workspace policy API and ES/EN administration surface for enable/disable and severity;
- keep deterministic versioned rule IDs and alert fingerprints.

## Stale definition / Definición de inactividad

A pull request is stale when:

1. its normalized signal type is `repository.pull_request`;
2. its normalized state is `open`;
3. it is not marked as merged;
4. its normalized `occurredAt` — sourced from the provider object's last update time — is at least seven days before evaluation time;
5. the workspace has explicitly enabled `repository.pull_request.stale.v1`.

An issue is stale when:

1. its normalized signal type is `repository.issue`;
2. its normalized state is `open`;
3. its normalized `occurredAt` is at least seven days before evaluation time;
4. the workspace has explicitly enabled `repository.issue.stale.v1`.

The v1 threshold is intentionally fixed. Threshold customization is a separate future slice rather than hidden inside a generic DSL.

## Lifecycle / Ciclo de vida

The stable fingerprint is:

`integration-rule:<rule-id>:<signal-id>`

The same normalized PR/issue signal ID is upserted as provider state changes. This allows one durable derived alert to move through its lifecycle instead of creating duplicates.

The worker emits a resolution candidate for an existing stale alert when:

- the work becomes recent again;
- the PR/issue closes;
- a PR becomes merged;
- the corresponding workspace rule is disabled.

Historical alerts and audit events are retained.

## Evaluation time / Tiempo de evaluación

Stale candidates use **rule evaluation time** as the candidate `occurredAt`, not the provider object's old update time.

This is required for correct reopen semantics. The derived-alert store only reopens a resolved alert when the new candidate occurred after the previous resolution. If an old provider update timestamp were reused forever, a PR or issue that became active, resolved its stale alert, and later became stale again could never reopen that alert.

The fingerprint remains stable while the evaluation occurrence time advances.

## Worker integration / Integración con worker

Repository refresh reconciliation now loads these durable lifecycle signal families together:

- `repository.ci`
- `repository.pull_request`
- `repository.issue`

CI behavior remains unchanged. PR and issue rules remain dormant until enabled through the workspace rule policy.

The existing provider adapter already retrieves PRs and issues sorted by provider update time and normalizes their current state before persistence. Provider-specific response models do not enter the rule engine.

## Administration / Administración

The existing `GET /v1/automation/rules` response now includes four built-ins:

- CI failed — enabled / urgent by default;
- CI action required — enabled / warning by default;
- stale pull request — disabled / warning by default;
- stale issue — disabled / warning by default.

The existing guarded `PATCH /v1/automation/rules/:ruleId` path can enable either stale rule and change its severity.

The ES/EN workspace panel exposes friendly labels:

- ES: `PR sin actividad`, `Issue sin actividad`;
- EN: `Stale pull request`, `Stale issue`.

The web mutation boundary and API both retain explicit versioned rule allow-lists; arbitrary rule IDs are rejected.

## Security and correctness / Seguridad y corrección

- no provider credentials enter rules, policies, alerts or audit metadata;
- no raw GitHub payload is interpreted by the rule engine;
- workspace policy isolation remains unchanged;
- private scope never loads automation administration;
- disabled stale rules do not change existing customer alert behavior;
- dismissed human decisions remain authoritative under the existing alert lifecycle;
- no scripts, expressions or arbitrary customer code are accepted.

## Acceptance / Aceptación

Slice 3 is accepted when:

1. historical CI rule defaults remain unchanged;
2. stale PR/issue rules appear disabled with warning severity by default;
3. exactly seven days of inactivity is sufficient when the corresponding rule is enabled;
4. recent, closed or merged work produces no stale candidate;
5. inactive/disabled stale conditions resolve the stable fingerprint;
6. evaluation time allows a previously resolved alert to reopen after a later stale period;
7. API and web policy allow-lists recognize both new versioned rule IDs;
8. ES/EN administration copy describes the 7-day behavior;
9. lint, typecheck, tests, build and all existing regression workflows remain green.

## Deliberately deferred / Diferido expresamente

- customer-configurable inactivity thresholds;
- arbitrary user-authored rule conditions or DSL;
- automation actions beyond derived-alert behavior;
- AI-generated rules;
- additional integration providers;
- GitHub App/OAuth authorization.
