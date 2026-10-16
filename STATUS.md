# Project status / Estado del proyecto

**Current phase:** Phase 5 — Automation and intelligence  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Status:** Phase 5 Slice 9 is merged as `74cbf3b8462b2c4720a6d7d9bd369ec63bc156ce` and post-merge validated 9/9. Phase 5 Slice 10 — Task dependencies / Dependencias entre tareas — is active.

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

### Phase 5 Slice 9 — Stale threshold UI / UI de umbral de inactividad

- [x] ES/EN automation-rule cards expose the stale inactivity threshold only for stale PR/issue rules.
- [x] Whole-day bounds `1..365`, historical seven-day fallback and strict same-origin parser boundary.
- [x] CI rules reject threshold input and private scope never loads the editor.
- [x] Parser coverage and `docs/33-stale-threshold-ui.md`.
- [x] PR #41 merged as `74cbf3b8462b2c4720a6d7d9bd369ec63bc156ce`.
- [x] Resulting `main` validated with all nine workflows green.

**Phase 5 Slice 9: CLOSED / CERRADA.**

## Active / Activo

### Phase 5 Slice 10 — Task dependencies / Dependencias entre tareas

Implemented on `feat/phase-5-task-dependencies` so far:

- [x] `Task.dependencyIds` introduces an explicit local dependency graph while legacy tasks without the field remain compatible.
- [x] `PUT /v1/tasks/:id/dependencies` replaces the direct dependency set.
- [x] Workspace/private scope and actor are derived from the authenticated session; administration requires `tasks.write` plus `command-center` entitlement.
- [x] Maximum 50 unique dependency IDs with strict ID validation.
- [x] Self-dependencies are rejected.
- [x] Every dependency must resolve in the exact same server-derived scope; foreign workspace/private references are treated as missing.
- [x] Direct and transitive cycles are rejected before persistence.
- [x] Dependency mutations commit transactionally with `task.dependencies_changed` audit outbox events containing previous/resulting IDs.
- [x] Per-scope graph-version locking serializes concurrent dependency mutations so write-skew cannot create cycles from stale snapshots.
- [x] API/unit coverage for actor/scope derivation, private isolation, capabilities, invalid arrays, missing references, self-dependencies and cycles.
- [x] Domain/security documentation in `docs/03-domain-data-model.md` and `docs/34-task-dependencies.md`.
- [ ] Docker smoke for real Mongo mutation + delivered audit event.
- [ ] Final-head regression validation.
- [ ] Merge and post-merge `main` validation.

**Phase 5 Slice 10: IMPLEMENTATION ACTIVE / IMPLEMENTACIÓN ACTIVA.**

## Deliberately deferred / Diferido expresamente

- [ ] Dependency-chain scoring; it starts only after the graph model/mutation boundary is green.
- [ ] Customer-facing task dependency editor/graph UI.
- [ ] Automatic task status mutations driven by dependencies.
- [ ] Arbitrary user-authored conditions or rule DSL.
- [ ] Automation actions beyond current derived-alert behavior.
- [ ] AI-generated automation rules, weights, thresholds, dependencies or silent priority changes.
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
12. Browser/API clients cannot choose tenant or actor identity; those are derived from session context.
13. Task dependencies reference local task IDs only and cannot cross the resolved scope boundary.
14. Task dependency graphs are acyclic; self-dependencies, missing references and cycles are rejected before commit.
15. Dependency graph mutations are transactionally audited and serialized per scope against concurrent write-skew.
16. Legacy tasks without `dependencyIds` are interpreted as having no dependencies.
17. Dependency data does not affect priority scores until the dedicated later scoring slice.

## Next / Siguiente

1. Add the real Docker smoke for dependency persistence and transactional audit delivery.
2. Validate the final Slice 10 head with lint, typecheck, tests, build and all existing regression workflows.
3. Correct any dependency/runtime regression directly on this slice.
4. Merge the exact validated head and revalidate resulting `main`.
5. Only then open dependency-chain scoring as an isolated next slice.
6. Keep dependency UI, arbitrary DSL, external automation actions, AI changes, OAuth and additional providers as separate fronts.
7. When commercial publication is scheduled, create the Kairoseth Software catalog entry as **Gestor de Trabajo / Work Manager**.

## Current blockers / Bloqueos actuales

No known product blocker. Slice 10 still needs the real Docker audit smoke before final regression validation.

## Operating rule

Update this file at meaningful milestones. Keep Phase 5 deterministic, explainable, auditable, workspace-isolated and independently releasable; AI may assist but must not become required for core correctness.
