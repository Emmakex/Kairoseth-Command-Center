# 27 — Stale work rules / Reglas de trabajo sin actividad

## Goal / Objetivo

Extend the proven Phase 5 rule engine from CI-only alerts to normalized pull-request and issue signals without introducing arbitrary executable rule logic.  
Extender el motor probado de reglas de la Fase 5 desde alertas de CI a señales normalizadas de pull requests e issues sin introducir lógica ejecutable arbitraria.

## Built-in rules / Reglas incorporadas

Two deterministic built-in rules exist:

- `repository.pull_request.stale.v1`
- `repository.issue.stale.v1`

Both rules:

- consume only durable normalized integration signals;
- default to **7 days** of inactivity;
- default to **disabled** so existing installations do not receive new alerts without opting in;
- default to `warning` severity when enabled;
- reuse the existing workspace policy API and ES/EN administration surface for enable/disable and severity;
- keep deterministic versioned rule IDs and alert fingerprints.

Phase 5 Slice 8 extends the policy with an optional workspace threshold. The effective inactivity threshold can be configured independently for each stale rule as a whole number from **1 through 365 days**. A workspace without a threshold override continues to use exactly **7 days**.

## Stale definition / Definición de inactividad

A pull request is stale when:

1. its normalized signal type is `repository.pull_request`;
2. its normalized state is `open`;
3. it is not marked as merged;
4. its normalized `occurredAt` — sourced from the provider object's last update time — is at least the effective pull-request threshold before evaluation time;
5. the workspace has explicitly enabled `repository.pull_request.stale.v1`.

An issue is stale when:

1. its normalized signal type is `repository.issue`;
2. its normalized state is `open`;
3. its normalized `occurredAt` is at least the effective issue threshold before evaluation time;
4. the workspace has explicitly enabled `repository.issue.stale.v1`.

The threshold remains a typed built-in policy field. It is not an expression, script, arbitrary condition, or generic rule DSL.

## Threshold lifecycle / Ciclo de vida del umbral

Changing the threshold never changes the versioned rule ID or the stable alert fingerprint:

`integration-rule:<rule-id>:<signal-id>`

Therefore:

- increasing the threshold can make an existing stale item recent again; the next reconciliation resolves the existing derived alert while retaining its history;
- lowering the threshold can make an item stale earlier; the same stable fingerprint is activated or reopened according to the existing lifecycle rules;
- changing only enablement or severity preserves the current threshold;
- old persisted stale policies without the new field are read as the historical 7-day default.

CI rules do not support `staleAfterDays`; the API and persistence boundary reject attempts to attach a stale threshold to CI rules.

## Lifecycle / Ciclo de vida

The same normalized PR/issue signal ID is upserted as provider state changes. This allows one durable derived alert to move through its lifecycle instead of creating duplicates.

The worker emits a resolution candidate for an existing stale alert when:

- the work becomes recent relative to the effective threshold;
- the PR/issue closes;
- a PR becomes merged;
- the corresponding workspace rule is disabled.

Historical alerts and audit events are retained.

## Evaluation time / Tiempo de evaluación

Stale candidates use **rule evaluation time** as the candidate `occurredAt`, not the provider object's old update time.

This is required for correct reopen semantics. The derived-alert store only reopens a resolved alert when the new candidate occurred after the previous resolution. If an old provider update timestamp were reused forever, a PR or issue that became active, resolved its stale alert, and later became stale again could never reopen that alert.

The fingerprint remains stable while the evaluation occurrence time advances.

## Worker integration / Integración con worker

Repository refresh reconciliation loads these durable lifecycle signal families together:

- `repository.ci`
- `repository.pull_request`
- `repository.issue`

CI behavior remains unchanged. PR and issue rules remain dormant until enabled through the workspace rule policy. The worker already loads the effective workspace policy map, so the effective stale threshold is applied at reconciliation time without provider-specific logic.

The provider adapter retrieves PRs and issues sorted by provider update time and normalizes their current state before persistence. Provider-specific response models do not enter the rule engine.

## Administration / Administración

`GET /v1/automation/rules` returns four built-ins:

- CI failed — enabled / urgent by default;
- CI action required — enabled / warning by default;
- stale pull request — disabled / warning / 7 days by default;
- stale issue — disabled / warning / 7 days by default.

The guarded `PATCH /v1/automation/rules/:ruleId` path can enable either stale rule, change its severity, and set `staleAfterDays` from 1 to 365. Existing partial updates that omit `staleAfterDays` preserve the effective threshold.

The web mutation boundary and API retain explicit versioned rule allow-lists; arbitrary rule IDs are rejected. The customer-facing threshold editor is deliberately a separate UI slice.

## Security and correctness / Seguridad y corrección

- no provider credentials enter rules, policies, alerts or audit metadata;
- no raw GitHub payload is interpreted by the rule engine;
- workspace policy isolation remains unchanged;
- private scope never loads automation administration;
- disabled stale rules do not change existing customer alert behavior;
- missing threshold remains exactly 7 days;
- thresholds must be whole days in the closed range 1..365;
- CI rules cannot receive stale thresholds;
- threshold changes never change alert fingerprints;
- dismissed human decisions remain authoritative under the existing alert lifecycle;
- no scripts, expressions or arbitrary customer code are accepted.

## Acceptance / Aceptación

The current stale-work boundary is accepted when:

1. historical CI rule defaults remain unchanged;
2. stale PR/issue rules appear disabled with warning severity and 7-day threshold by default;
3. exactly the configured number of inactive days is sufficient when the corresponding rule is enabled;
4. recent, closed or merged work produces no stale candidate;
5. raising a threshold can resolve the existing stable fingerprint without deleting history;
6. lowering a threshold can activate/reopen the same fingerprint when the age condition becomes true;
7. API/persistence reject fractional, sub-1, above-365 thresholds and thresholds on CI rules;
8. partial enabled/severity updates preserve a previously configured threshold;
9. workspace policies remain isolated and old stored policies migrate logically to the 7-day default;
10. lint, typecheck, tests, build and all existing regression workflows remain green.

## Deliberately deferred / Diferido expresamente

- customer-facing ES/EN stale-threshold editor UI;
- arbitrary user-authored rule conditions or DSL;
- automation actions beyond derived-alert behavior;
- AI-generated rules;
- additional integration providers;
- GitHub App/OAuth authorization.
