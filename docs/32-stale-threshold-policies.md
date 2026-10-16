# 32 — Stale threshold policies / Políticas de umbral de inactividad

## Goal / Objetivo

Make the inactivity window of the two proven stale-work rules configurable per workspace without introducing a generic rule language or changing alert identity.  
Hacer configurable por espacio de trabajo la ventana de inactividad de las dos reglas probadas de trabajo sin actividad, sin introducir un lenguaje genérico de reglas ni cambiar la identidad de las alertas.

## Scope / Alcance

Phase 5 Slice 8 adds `staleAfterDays` only to:

- `repository.pull_request.stale.v1`
- `repository.issue.stale.v1`

The field:

- defaults to `7` when absent;
- accepts only integer whole days;
- is bounded to `1..365`;
- is stored with the existing workspace rule policy;
- is returned by `GET /v1/automation/rules` for stale rules;
- is accepted by `PATCH /v1/automation/rules/:ruleId` only for stale rules;
- is rejected for CI rules.

## Compatibility / Compatibilidad

Existing workspaces keep exactly the historical seven-day behavior. Existing stored stale policies that predate this field are interpreted as `staleAfterDays: 7` without requiring destructive migration.

Partial policy mutations preserve the current threshold. For example, changing only severity from `warning` to `urgent` does not reset a previously configured 14-day threshold.

## Runtime semantics / Semántica de ejecución

The worker continues to load the effective workspace policy map and passes it into the provider-neutral rule reconciler. The reconciler compares normalized signal `occurredAt` against evaluation time using the effective threshold for that rule.

Changing the threshold does not change:

- rule IDs;
- signal IDs;
- alert fingerprints;
- provider normalization;
- dismissal semantics;
- audit history.

Raising a threshold may resolve an alert if the work no longer qualifies as stale. Lowering a threshold may activate or reopen the same stable fingerprint on the next reconciliation.

## API / API

Example stale policy response:

```json
{
  "ruleId": "repository.pull_request.stale.v1",
  "enabled": true,
  "severity": "warning",
  "staleAfterDays": 14,
  "overridden": true
}
```

Example partial mutation:

```json
{
  "staleAfterDays": 14
}
```

The workspace and actor remain derived from the authenticated session. Client-supplied tenant or actor IDs are never authority.

## Persistence and audit / Persistencia y auditoría

The existing `signal_alert_rule_policies` collection stores the optional threshold next to enablement and severity. The existing unique `(workspaceId, ruleId)` boundary remains unchanged.

`automation.rule_policy_changed` audit-outbox events include the effective `staleAfterDays` and the previous value when the rule supports stale thresholds. Legacy records without a previous threshold are represented as the historical default of seven days.

## Security and correctness / Seguridad y corrección

- thresholds are data, never executable expressions;
- only the two allow-listed stale rule IDs accept the field;
- valid range is exactly 1 through 365 whole days;
- workspace isolation and `automation.manage` authorization remain unchanged;
- provider credentials never enter policy or audit metadata;
- private scope does not load workspace automation policy;
- stable fingerprints ensure policy tuning does not create duplicate alert identities.

## Acceptance / Aceptación

Slice 8 is complete when:

1. no override preserves seven days exactly;
2. custom PR and issue thresholds alter stale evaluation deterministically;
3. threshold changes preserve stable fingerprints and lifecycle history;
4. enabled/severity-only mutations preserve the current threshold;
5. old stored stale policies read as seven days;
6. thresholds outside `1..365`, fractional values, and thresholds on CI rules are rejected;
7. workspace isolation and authorization tests remain green;
8. all existing regression workflows remain green.

## Deferred / Diferido

- ES/EN customer-facing threshold editor;
- arbitrary customer-authored conditions or DSL;
- dependency-chain scoring/model;
- external automation actions;
- AI-generated rule changes;
- OAuth/additional providers.
