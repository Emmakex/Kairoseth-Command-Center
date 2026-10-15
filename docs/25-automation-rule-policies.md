# 25 — Automation rule policies / Políticas de reglas de automatización

## Goal / Objetivo

Start Phase 5 by making the existing deterministic built-in CI alert rules configurable per workspace without introducing an arbitrary rule language.  
Iniciar la Fase 5 haciendo configurables por espacio de trabajo las reglas CI deterministas ya existentes, sin introducir todavía un lenguaje arbitrario de reglas.

## Phase 5 Slice 1 scope / Alcance de Slice 1

The two proven built-in rules remain the only executable rule definitions:

- `repository.ci.failed.v1`
  - default: enabled
  - default severity: `urgent`
- `repository.ci.action_required.v1`
  - default: enabled
  - default severity: `warning`

Workspace administrators with `automation.manage` can persist an override for:

- `enabled` — whether the built-in rule can materialize an active alert;
- `severity` — the severity applied by that built-in rule.

No arbitrary conditions, expressions, custom event selectors or executable user code are introduced in this slice.

## Compatibility / Compatibilidad

If a workspace has no stored policy overrides, the exact Phase 4 behavior remains unchanged.

The existing deterministic alert fingerprint format is unchanged:

`integration-rule:<ruleId>:<signalId>`

Changing a policy therefore never creates a new alert identity merely because configuration changed.

## Persistence model / Modelo de persistencia

MongoDB collection: `signal_alert_rule_policies`

Each override is uniquely scoped by:

- `workspaceId`
- `ruleId`

Stored fields include:

- `id`
- `workspaceId`
- `ruleId`
- `enabled`
- `severity`
- `updatedByUserId`
- `createdAt`
- `updatedAt`

The store exposes effective policies by merging workspace overrides with the built-in defaults. Policy documents never contain provider credentials or raw integration payloads.

Every policy change writes a transactional audit-outbox event:

- type: `automation.rule_policy_changed`
- source: `automation-rules`
- metadata: rule id, new enabled/severity values and previous effective override when present.

## Authorization / Autorización

A dedicated capability is introduced:

- `automation.manage`

Default role presets:

- owner: granted
- admin: granted
- member: not granted

The API also requires the `command-center` product entitlement and derives the workspace from the authenticated session. Raw client workspace identifiers are never accepted as an authorization boundary.

## API / API

### Read effective policies

`GET /v1/automation/rules`

Returns both built-in rules using the effective workspace configuration, including whether each value comes from a stored override.

### Update one built-in policy

`PATCH /v1/automation/rules/:ruleId`

Accepted fields:

- `enabled?: boolean`
- `severity?: info | warning | urgent | critical`

At least one field is required. Unknown rule IDs are rejected; this endpoint cannot create arbitrary executable rules.

## Worker behavior / Comportamiento del worker

Before reconciling durable CI signals, the worker loads the effective policy map for the current workspace.

### Enabled rule

The built-in evaluator behaves as before, using the effective severity.

### Severity change

If an alert with the same deterministic fingerprint is already open or acknowledged, the existing alert is updated in place. Its ID and fingerprint remain unchanged. A transactional `alert.policy_updated` audit event records the previous and new severity.

### Disabled rule

The evaluator suppresses the active candidate for that rule. Lifecycle reconciliation emits a resolution candidate for any matching currently active derived alert, so disabling a rule resolves rather than deletes historical state.

Dismissed alerts remain human decisions and are not reopened or mutated by policy reconciliation.

## Provider neutrality / Neutralidad de proveedor

Policies are keyed by provider-neutral built-in rule IDs and are consumed after normalized durable signal persistence. They do not inspect GitHub webhook payloads or GitHub-specific credentials.

This keeps the Phase 5 policy layer reusable when additional providers produce the same normalized signal types later.

## Acceptance / Aceptación

The slice is accepted only when:

1. pure rule tests prove historical defaults remain unchanged;
2. severity overrides change severity without changing fingerprints;
3. disabling a rule suppresses the candidate and produces a resolution candidate;
4. API tests prove defaults, partial updates, `automation.manage`, invalid-input rejection and workspace isolation;
5. the existing background-refresh Docker smoke proves the real worker lifecycle:
   - default `urgent` failure alert;
   - same alert/fingerprint updated to `critical` by workspace policy;
   - `alert.policy_updated` audit delivery;
   - disabling the rule resolves that same alert;
6. all existing repository regression workflows remain green.

## Deliberately deferred / Diferido expresamente

- customer-facing rule policy UI;
- custom user-authored conditions or DSL;
- stale PR/issue rule definitions;
- schedules/actions beyond the current derived-alert behavior;
- additional providers;
- AI-generated automation rules.

The next slice may expose these safe built-in policies in the ES/EN product UI only after this runtime/API foundation is green and merged.
