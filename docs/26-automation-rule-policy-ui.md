# 26 — Automation rule policy UI / UI de políticas de automatización

## Goal / Objetivo

Expose the safe Phase 5 built-in rule policies in the customer-facing workspace UI in Spanish and English without widening the executable automation boundary.  
Exponer en la interfaz del espacio de trabajo, en español e inglés, las políticas seguras de reglas integradas de la Fase 5 sin ampliar el límite de automatización ejecutable.

## Phase 5 Slice 2 scope / Alcance de Slice 2

The workspace administration surface exposes only the two proven built-in rules:

- `repository.ci.failed.v1`
- `repository.ci.action_required.v1`

For each rule, an authorized administrator can:

- enable or disable the rule;
- choose `info`, `warning`, `urgent` or `critical` severity;
- see whether the effective configuration is the built-in default or a stored workspace override.

The UI never accepts arbitrary rule IDs, conditions, expressions, scripts or executable user logic.

## Authorization / Autorización

The panel is rendered only when:

- scope is `workspace`;
- the authenticated session includes `automation.manage`.

The API remains authoritative and independently enforces authenticated workspace scope, `automation.manage` and the `command-center` entitlement.

Private scope never loads or renders the administration surface.

## Read path / Ruta de lectura

The server-rendered web application calls:

`GET /v1/automation/rules`

through the authenticated internal API client. The response contains only effective policy data:

- `ruleId`
- `enabled`
- `severity`
- `overridden`
- optional `updatedAt`

No provider credentials or raw integration payloads enter the page.

## Mutation path / Ruta de mutación

Forms post to the same-origin web handler:

`POST /api/automation/rules`

The web boundary validates the form against an explicit allow-list and then forwards a JSON request to:

`PATCH /v1/automation/rules/:ruleId`

Accepted client values are restricted to:

- the two known built-in rule IDs;
- `enabled = true | false`;
- `severity = info | warning | urgent | critical`.

Rule IDs are URL-encoded before the API path is constructed.

## Localization / Localización

The panel ships first-class ES/EN product copy.

Customer-facing labels do not expose implementation-only terminology as the primary name:

- ES: `CI fallida`, `CI requiere acción`
- EN: `CI failed`, `CI action required`

The versioned rule ID remains visible as secondary technical context for administrators.

## Error and session behavior / Errores y sesión

The mutation proxy follows the established dashboard behavior:

- `401` clears the local session cookie and redirects to login;
- `400` maps to invalid input;
- `403` maps to forbidden;
- `404` maps to not found;
- `409` maps to conflict;
- unexpected upstream/runtime failures map to the generic error state;
- success redirects back to workspace scope with the existing saved confirmation.

## Acceptance / Aceptación

Slice 2 is accepted when:

1. parser tests reject arbitrary rules, invalid booleans and invalid severities;
2. the dashboard loads policies only for workspace users with `automation.manage`;
3. the ES and EN administration surface renders both proven rules;
4. updates travel through the same-origin web boundary to the authenticated policy API;
5. private scope never renders or loads rule administration;
6. lint, typecheck, unit tests, build and existing regression workflows remain green.

## Deliberately deferred / Diferido expresamente

- arbitrary user-authored rule DSL or conditions;
- stale pull-request or issue rules;
- automation actions beyond current derived alerts;
- AI-generated rules;
- GitHub App/OAuth and additional providers.
