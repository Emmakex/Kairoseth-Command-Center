# Project status / Estado del proyecto

**Current phase:** Phase 5 — Automation and intelligence  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Status:** Phase 5 Slice 8 is merged as `720f06ddd78d7a9c615621f6301357993338004e` and post-merge validated 9/9. Phase 5 Slice 9 — Stale threshold UI / UI de umbral de inactividad — is active.

## Naming rule / Regla de naming

- **ES:** Gestor de Trabajo
- **EN:** Work Manager
- `Kairoseth Command Center` remains the technical/internal repository name.
- Public product names do **not** use `Kairoseth` as a prefix; Kairoseth is the vendor/catalog brand.
- ES and EN commercial names/descriptors are defined independently.

## Completed / Completado

### Phase 3 — Operational product

- [x] Portable monorepo, standalone authentication and strict workspace/private isolation.
- [x] Projects, Tasks, Alerts, Decisions, Timeline, Quick Capture and Milestones.
- [x] Transactional audit outbox, production-oriented standalone profile, backup and guarded restore.

**Phase 3 technical release boundary: CLOSED / CERRADA.**

### Phase 4 — GitHub integration

- [x] Repository links, encrypted connections, live sync and provider-neutral signals.
- [x] Retryable background/recurring refresh and verified webhook ingestion.
- [x] Deterministic derived-alert lifecycle and integration activity/setup/maintenance/webhook UI.
- [x] Final Phase 4 closure commit `d1bfa929b6b2aa409991949513218826f10c2bb0` validated 9/9.

**Phase 4 token-backed GitHub boundary: CLOSED / CERRADA.**

### Phase 5 Slice 1 — Automation rule policies

- [x] Workspace-scoped enable/severity policies for deterministic built-in CI rules.
- [x] Guarded API, `automation.manage`, worker reconciliation and transactional audit.
- [x] PR #33 merged as `3bda1db529e46e9f52ce1cf4cf4726495fa6a0e4`; `main` 9/9 green.

### Phase 5 Slice 2 — Automation rule policy UI

- [x] ES/EN workspace administration surface and safe same-origin mutation boundary.
- [x] PR #34 merged as `37755e580fef985dfda96645f7ccc86704a84e08`; `main` 9/9 green.

### Phase 5 Slice 3 — Stale work rules

- [x] Provider-neutral stale PR/issue rules with seven-day default and opt-in defaults.
- [x] Stable fingerprints, resolve/reopen lifecycle and ES/EN configuration UI.
- [x] PR #35 merged as `1a88ae5280d0115fbdf2e61834859d6847bcc77e`; `main` 9/9 green.

### Phase 5 Slice 4 — Explainable prioritization

- [x] Deterministic task/alert ranking with stable reasons, timezone-aware day boundaries and ES/EN Today surface.
- [x] PR #36 merged as `375b9d2ecef75243f6335732bd1f6e646df1c3f0`; `main` 9/9 green.

### Phase 5 Slice 5 — Project/milestone priority risk

- [x] Project and milestone delivery risk added to the same deterministic priority ranking.
- [x] API capability boundary expanded to task/alert/project/milestone reads.
- [x] PR #37 merged as `f533c480ea841e61303819e63df3d5801f6ec54d`; `main` 9/9 green.

### Phase 5 Slice 6 — Prioritization weight policies

- [x] Explicit `PrioritizationWeights` model with exact historical defaults.
- [x] Workspace-scoped durable policies, integer bounds `0..100`, guarded API and transactional audit.
- [x] Workspace ranking applies effective weights; private ranking intentionally keeps product defaults.
- [x] PR #38 merged as `f4ef6e27f50b35c88f7c39e298c63035fe7ee684`; `main` 9/9 green.

### Phase 5 Slice 7 — Prioritization weight UI

- [x] ES/EN workspace editor for all 15 deterministic prioritization weights.
- [x] Workspace-only + `automation.manage` loading/rendering and strict same-origin mutation boundary.
- [x] PR #39 merged as `76e59d11c7471682d80ce9b0c65fb571b9e50acd`; `main` 9/9 green.

### Phase 5 Slice 8 — Stale threshold policies / Políticas de umbral de inactividad

- [x] Historical default remains exactly seven days when no threshold override exists.
- [x] Only stale PR/issue rules support `staleAfterDays`, bounded to whole days `1..365`.
- [x] Provider-neutral reconciliation applies the effective workspace threshold without changing rule IDs or alert fingerprints.
- [x] Raising/lowering thresholds uses the existing resolve/reopen lifecycle with stable history.
- [x] Legacy stored stale policies without the field read as seven days.
- [x] Existing policy persistence, guarded API and transactional audit include current/previous thresholds.
- [x] Partial enable/severity updates preserve the effective threshold and CI rules reject threshold fields.
- [x] Unit/API coverage and `docs/32-stale-threshold-policies.md`.
- [x] PR #40 merged as `720f06ddd78d7a9c615621f6301357993338004e`.
- [x] Resulting `main` validated with all nine workflows green.

**Phase 5 Slice 8: CLOSED / CERRADA.**

## Active / Activo

### Phase 5 Slice 9 — Stale threshold UI / UI de umbral de inactividad

Implemented on `feat/phase-5-stale-threshold-ui` so far:

- [x] Existing ES/EN automation-rule cards expose **Days without activity / Días sin actividad** only for stale PR/issue rules.
- [x] Numeric browser input is required and bounded to whole days `1..365`.
- [x] Effective API threshold is displayed; defensive fallback remains the historical seven-day default.
- [x] CI rule cards do not render a threshold field.
- [x] Stale-rule help copy no longer claims a fixed seven-day window and explains the configurable threshold.
- [x] Existing same-origin `/api/automation/rules` route is reused; no new backend or browser API route is introduced.
- [x] Web parser allow-lists form fields and rule IDs, parses only whole-day `1..365` thresholds and rejects thresholds on CI rules.
- [x] Parser rejects unexpected authority fields such as client-supplied workspace identity.
- [x] Existing workspace-only + `automation.manage` loading/rendering boundary remains unchanged; private scope never loads the editor.
- [x] Compatibility remains for older stale-rule mutations that omit the threshold.
- [x] Parser tests cover valid thresholds, lower/upper bounds, invalid values, CI rejection, unexpected fields and existing rule validation.
- [x] Product/security documentation in `docs/33-stale-threshold-ui.md`.
- [ ] Final-head regression validation.
- [ ] Merge and post-merge `main` validation.

**Phase 5 Slice 9: VALIDATION PENDING / VALIDACIÓN PENDIENTE.**

## Deliberately deferred / Diferido expresamente

- [ ] Dependency-chain scoring and dependency data-model/mutation work; no dependency model exists yet.
- [ ] Arbitrary user-authored conditions or rule DSL.
- [ ] Automation actions beyond current derived-alert behavior.
- [ ] AI-generated automation rules, weights, thresholds or silent priority changes.
- [ ] GitHub App/OAuth and additional providers.

## Security and correctness invariants

1. Workspace/private scope is server-derived from authenticated context.
2. Product entitlement and capability checks are server-enforced.
3. Provider credentials never enter durable jobs, signals, alerts, policies, prioritization or audit events.
4. Derived automation remains provider-neutral over normalized durable signals.
5. Versioned rule IDs and deterministic alert fingerprints remain stable across policy changes.
6. Private scope never loads workspace automation or prioritization administration.
7. Human dismissed decisions remain authoritative.
8. Priority ranking remains deterministic, explainable and AI-independent.
9. Missing prioritization policy preserves exact product defaults.
10. Missing stale threshold preserves the historical seven-day default exactly.
11. Stale thresholds are whole days `1..365` and accepted only for the two stale-work rules.
12. CI automation rules reject stale-threshold fields at browser/parser and API boundaries.
13. Partial enable/severity changes preserve the effective stale threshold.
14. Threshold changes preserve alert identity and history through the existing resolve/reopen lifecycle.
15. Workspace policy changes remain transactionally audited and isolated by workspace.
16. Browser/API clients cannot choose tenant or actor identity; those are derived from session context.
17. The threshold editor reuses the same-origin authenticated mutation route and never exposes provider credentials.
18. Dependency-chain scoring stays separate until dependency data is explicitly modelled and authorized.

## Next / Siguiente

1. Validate the final Slice 9 head with lint, typecheck, tests, build and all existing regression workflows.
2. Correct any UI/parser regression directly on this slice.
3. Merge the exact validated head and revalidate resulting `main`.
4. Select the next Phase 5 micro-slice only from the resulting green repository state and documented model boundaries.
5. Keep dependency modelling, arbitrary DSL, external automation actions, AI changes, OAuth and additional providers as separate fronts.
6. When commercial publication is scheduled, create the Kairoseth Software catalog entry as **Gestor de Trabajo / Work Manager**.

## Current blockers / Bloqueos actuales

No known product blocker. Slice 9 is ready for regression validation.

## Operating rule

Update this file at meaningful milestones. Keep Phase 5 deterministic, explainable, auditable, workspace-isolated and independently releasable; AI may assist but must not become required for core correctness.
