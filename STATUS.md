# Project status / Estado del proyecto

**Current phase:** Phase 5 — Automation and intelligence  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Status:** Phase 5 Slice 6 is merged as `f4ef6e27f50b35c88f7c39e298c63035fe7ee684` and post-merge validated 9/9. Phase 5 Slice 7 — Prioritization weight UI / UI de pesos de priorización — is active.

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

- [x] Provider-neutral stale PR/issue rules with seven-day v1 threshold and opt-in defaults.
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
- [x] Workspace-scoped durable `prioritization_weight_policies`, integer bounds `0..100` and transactional `prioritization.weights_changed` audit.
- [x] `GET /v1/prioritization/weights` and guarded partial `PATCH /v1/prioritization/weights`.
- [x] Administration requires `automation.manage`; workspace/actor are server-derived.
- [x] Workspace ranking applies effective weights; private ranking intentionally keeps product defaults.
- [x] Stable reason codes and the 100-point cap remain unchanged.
- [x] Unit/API coverage and `docs/30-prioritization-weight-policies.md`.
- [x] PR #38 merged as `f4ef6e27f50b35c88f7c39e298c63035fe7ee684`.
- [x] Resulting `main` validated with all nine workflows green.

**Phase 5 Slice 6: CLOSED / CERRADA.**

## Active / Activo

### Phase 5 Slice 7 — Prioritization weight UI / UI de pesos de priorización

Implemented on `feat/phase-5-priority-weight-ui` so far:

- [x] Web API client reads the effective workspace prioritization-weight policy.
- [x] ES/EN administration panel groups all 15 weights into Tasks, Alerts, Projects and Milestones.
- [x] Inputs are bounded to integer `0..100` and the UI explains the 100-point final cap and private-scope default behavior.
- [x] Panel displays default-vs-custom policy state.
- [x] Panel is loaded/rendered only in workspace scope with `automation.manage`.
- [x] Private scope never loads/renders workspace weight administration.
- [x] Priority-panel loading now matches the authoritative API capability set: tasks, alerts, projects and milestones read.
- [x] Same-origin `POST /api/prioritization/weights` proxy forwards only validated data to the authenticated API.
- [x] Web parser allow-lists exactly the 15 weight names plus locale/operation and rejects missing, unexpected, fractional, negative, non-numeric and >100 values.
- [x] Parser unit coverage including `0` and `100` boundaries.
- [x] Architecture/UI documentation in `docs/31-prioritization-weight-ui.md`.
- [ ] Final-head regression validation.
- [ ] Merge and post-merge `main` validation.

**Phase 5 Slice 7: VALIDATION PENDING / VALIDACIÓN PENDIENTE.**

## Deliberately deferred / Diferido expresamente

- [ ] Dependency-chain scoring and dependency data-model/mutation work; no dependency model exists yet.
- [ ] Customer-configurable stale thresholds.
- [ ] Arbitrary user-authored conditions or rule DSL.
- [ ] Automation actions beyond current derived-alert behavior.
- [ ] AI-generated automation rules, weights or silent priority changes.
- [ ] GitHub App/OAuth and additional providers.

## Security and correctness invariants

1. Workspace/private scope is server-derived from authenticated context.
2. Product entitlement and capability checks are server-enforced.
3. Provider credentials never enter durable jobs, signals, alerts, policies, prioritization or audit events.
4. Derived automation remains provider-neutral over normalized durable signals.
5. Versioned rule IDs and deterministic alert fingerprints remain stable.
6. Private scope never loads workspace automation administration or workspace prioritization-weight overrides/editors.
7. Human dismissed decisions remain authoritative.
8. Priority ranking remains deterministic, explainable and AI-independent.
9. Stable reason codes and the final 100-point cap are unchanged by weight configuration.
10. Priority scoring remains read-only and never triggers external actions.
11. Missing weight policy preserves exact product defaults.
12. Workspace policies are unique per workspace, integer-bounded and transactionally audited.
13. Workspace policy changes cannot alter private-scope ranking behavior.
14. Browser weight mutation is allow-listed and cannot choose tenant, actor, API path or arbitrary JSON fields.
15. Dependency-chain scoring stays separate until dependency data is explicitly modelled and authorized.

## Next / Siguiente

1. Validate the final Slice 7 head with lint, typecheck, tests, build and all existing regression workflows.
2. Correct any web/parser regression directly on this slice.
3. Merge the exact validated head and revalidate resulting `main`.
4. Select the next isolated Phase 5 slice only from the resulting green repository state.
5. Keep dependency modelling, stale-threshold customization, AI suggestions, external automation actions, OAuth and additional providers as separate fronts.
6. When commercial publication is scheduled, create the Kairoseth Software catalog entry as **Gestor de Trabajo / Work Manager**.

## Current blockers / Bloqueos actuales

No known product blocker. Slice 7 is ready for regression validation.

## Operating rule

Update this file at meaningful milestones. Keep Phase 5 deterministic, explainable, auditable, workspace-isolated and independently releasable; AI may assist but must not become required for core correctness.
