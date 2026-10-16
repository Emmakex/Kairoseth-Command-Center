# 33 — Stale threshold editor UI / UI de umbrales de inactividad

## Goal / Objetivo

Expose the proven workspace stale-work threshold policy through the existing ES/EN automation administration surface without adding a new backend contract or changing rule semantics.  
Exponer la política probada de umbral de inactividad del espacio de trabajo mediante la superficie ES/EN existente de administración de automatización, sin añadir un contrato backend nuevo ni cambiar la semántica de las reglas.

## Scope / Alcance

Phase 5 Slice 9 extends the existing automation rule cards only for:

- `repository.pull_request.stale.v1`
- `repository.issue.stale.v1`

Each stale rule shows a numeric **Days without activity / Días sin actividad** field with:

- minimum `1`;
- maximum `365`;
- whole-day step `1`;
- required browser input;
- effective API value as the initial value;
- defensive fallback to the historical default `7` if an older response omits the field.

CI rule cards do not render the threshold field.

## ES/EN copy / Textos ES/EN

The stale-rule descriptions no longer claim a fixed seven-day window. They explain that the alert is created when open work exceeds the configured inactivity threshold.

Spanish:

- **Días sin actividad**
- `Entre 1 y 365 días. Si nunca se personaliza, el valor predeterminado es 7.`

English:

- **Days without activity**
- `Between 1 and 365 days. The default remains 7 until explicitly customized.`

## Mutation boundary / Frontera de mutación

The existing same-origin route `/api/automation/rules` remains the only browser mutation path for automation rule cards.

The web parser:

- keeps an explicit allow-list of form fields;
- keeps an explicit allow-list of built-in rule IDs;
- accepts `staleAfterDays` only for the two stale-work rule IDs;
- parses only integer text from `1` through `365`;
- rejects fractional, negative, zero, above-365 and non-numeric values;
- rejects threshold input attached to CI rules;
- rejects unexpected fields such as client-supplied workspace or actor identifiers;
- forwards only the validated JSON body to the existing API.

The API remains authoritative for authentication, workspace identity, actor identity, capability checks, product entitlement and threshold validation.

## Loading and tenancy / Carga y tenancy

No new data-loading route is introduced. The dashboard already loads automation rules only when:

1. the selected scope is `workspace`;
2. the authenticated session has `automation.manage`.

Private scope therefore neither loads nor renders the threshold editor.

## Compatibility / Compatibilidad

- Existing CI administration remains unchanged.
- Existing stale-rule form mutations without `staleAfterDays` remain parseable for compatibility with older callers.
- The visible stale-rule editor always submits the effective threshold.
- No threshold change alters rule IDs, alert fingerprints or stored alert history.
- The existing backend continues to interpret missing threshold as exactly seven days.

## Security and correctness / Seguridad y corrección

- Browser input cannot select workspace or actor identity.
- CI rules cannot receive an inactivity threshold through the UI parser.
- Only whole-day values `1..365` cross the browser mutation boundary.
- The session cookie is handled by the same-origin server route and is not exposed to client-side JavaScript.
- No provider credential is rendered or submitted.
- No arbitrary expressions, scripts or rule DSL are accepted.
- The UI changes policy data only; it does not directly create, resolve or mutate alerts.

## Acceptance / Aceptación

Slice 9 is complete when:

1. both stale rule cards show the ES/EN threshold field;
2. CI rule cards do not show it;
3. the current effective threshold is shown, defaulting defensively to `7`;
4. browser and parser boundaries enforce whole days `1..365`;
5. the parser rejects thresholds on CI rules and rejects unexpected authority fields;
6. the existing same-origin route forwards the validated threshold to the already-proven API;
7. workspace-only and `automation.manage` boundaries remain unchanged;
8. parser tests, lint, typecheck, build and all existing regression workflows remain green.

## Deferred / Diferido

- dependency data-model and dependency-chain scoring;
- arbitrary user-authored rule conditions or DSL;
- external automation actions;
- AI-generated rule/threshold changes;
- GitHub App/OAuth and additional providers.
