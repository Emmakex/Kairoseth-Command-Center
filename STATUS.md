# Project status / Estado del proyecto

**Current phase:** Phase 5 — Automation and intelligence  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Status:** Phase 5 Slice 10 is merged as `67da2d81b3cca2a40f77b0710bb91cb8270499a8` and post-merge validated 9/9. Phase 5 Slice 11 — Dependency-aware prioritization / Priorización por dependencias — is active.

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

### Phase 5 — Closed slices / Slices cerradas

- [x] Slice 1 — Automation rule policies — PR #33 `3bda1db529e46e9f52ce1cf4cf4726495fa6a0e4`.
- [x] Slice 2 — Automation rule policy UI — PR #34 `37755e580fef985dfda96645f7ccc86704a84e08`.
- [x] Slice 3 — Stale work rules — PR #35 `1a88ae5280d0115fbdf2e61834859d6847bcc77e`.
- [x] Slice 4 — Explainable prioritization — PR #36 `375b9d2ecef75243f6335732bd1f6e646df1c3f0`.
- [x] Slice 5 — Project/milestone priority risk — PR #37 `f533c480ea841e61303819e63df3d5801f6ec54d`.
- [x] Slice 6 — Prioritization weight policies — PR #38 `f4ef6e27f50b35c88f7c39e298c63035fe7ee684`.
- [x] Slice 7 — Prioritization weight UI — PR #39 `76e59d11c7471682d80ce9b0c65fb571b9e50acd`.
- [x] Slice 8 — Stale threshold policies — PR #40 `720f06ddd78d7a9c615621f6301357993338004e`.
- [x] Slice 9 — Stale threshold UI — PR #41 `74cbf3b8462b2c4720a6d7d9bd369ec63bc156ce`.
- [x] Slice 10 — Task dependencies — PR #42 `67da2d81b3cca2a40f77b0710bb91cb8270499a8`.

Every resulting `main` boundary through Slice 10 was validated with all nine workflows green.

### Phase 5 Slice 10 — Task dependencies / Dependencias entre tareas

- [x] Explicit `Task.dependencyIds` graph with legacy compatibility.
- [x] Guarded `PUT /v1/tasks/:id/dependencies` for workspace/private scope.
- [x] Same-scope references only, maximum 50, no self-reference and no cycles.
- [x] Per-scope transactional graph serialization prevents concurrent write-skew cycles.
- [x] `task.dependencies_changed` is transactionally audited.
- [x] Unit/API coverage plus real Docker persistence/audit smoke.
- [x] PR #42 final head `26b386323e3ebd6c40d539abe1436c389e449776` validated 9/9.
- [x] Merged as `67da2d81b3cca2a40f77b0710bb91cb8270499a8`; resulting `main` validated 9/9.

**Phase 5 Slice 10: CLOSED / CERRADA.**

## Active / Activo

### Phase 5 Slice 11 — Dependency-aware prioritization / Priorización por dependencias

Implemented on `feat/phase-5-dependency-prioritization` so far:

- [x] Deterministic reverse traversal of explicit `dependencyIds` calculates unique active downstream dependents.
- [x] Completed/cancelled downstream tasks are excluded and stop transitive propagation through that node.
- [x] New stable reason code `task.dependency_impact` exposes dependent count and exact contribution.
- [x] New configurable weight `taskDependencyImpactPerDependent`, default `10`, range `0..100`.
- [x] Dependency reason contribution is `min(100, active dependent count × configured weight)`; final score remains capped at `100`.
- [x] Legacy persisted 15-field weight policies automatically inherit the new default without destructive migration.
- [x] Workspace weight API automatically accepts the new allow-listed key through the existing effective-policy boundary.
- [x] ES/EN weight editor exposes the new task weight.
- [x] ES/EN priority explanations render **Desbloquea tareas activas / Unblocks active tasks** with count and contribution.
- [x] Unit coverage for transitive/unique counting, completed/cancelled boundaries, configurable scoring, cap behavior and legacy policy compatibility.
- [x] Product documentation in `docs/35-dependency-prioritization.md`.
- [ ] Final-head regression validation.
- [ ] Merge and post-merge `main` validation.

**Phase 5 Slice 11: VALIDATION PENDING / VALIDACIÓN PENDIENTE.**

## Deliberately deferred / Diferido expresamente

- [ ] Customer-facing task dependency editor/graph UI.
- [ ] Automatic task status mutations driven by dependencies.
- [ ] Critical-path duration forecasting or probabilistic deadline prediction.
- [ ] Arbitrary user-authored conditions or executable rule DSL.
- [ ] Automation actions beyond current derived-alert behavior.
- [ ] AI-generated rules, weights, thresholds, dependencies or silent priority changes.
- [ ] GitHub App/OAuth and additional providers.

## Security and correctness invariants

1. Workspace/private scope is server-derived from authenticated context.
2. Product entitlement and capability checks are server-enforced.
3. Provider credentials never enter durable jobs, signals, alerts, policies, prioritization or audit events.
4. Derived automation and prioritization remain deterministic, explainable and AI-independent.
5. Private scope never loads workspace administration and cannot cross workspace dependency graphs.
6. Human dismissed decisions remain authoritative.
7. Missing prioritization policy preserves current product defaults.
8. Legacy stored prioritization policies gain new default fields by effective merge, without changing existing configured values.
9. Task dependencies reference local same-scope task IDs only and remain acyclic.
10. Dependency scoring uses only explicit stored graph edges; no text/AI inference occurs.
11. Completed/cancelled work does not create dependency impact.
12. Every dependency score contribution is exposed through stable reason code `task.dependency_impact`.
13. Final priority scores remain capped at `100`.

## Next / Siguiente

1. Validate Slice 11 final head with lint, typecheck, tests, build and all existing regression workflows.
2. Correct any regression directly on this slice.
3. Merge the exact validated head and revalidate resulting `main`.
4. Select the next isolated Phase 5 slice from the resulting green repository state.
5. Keep dependency UI, automatic status behavior, arbitrary DSL, AI changes, OAuth and additional providers as separate fronts.
6. When commercial publication is scheduled, create the Kairoseth Software catalog entry as **Gestor de Trabajo / Work Manager**.

## Current blockers / Bloqueos actuales

No known product blocker. Slice 11 is ready for regression validation.

## Operating rule

Update this file at meaningful milestones. Keep Phase 5 deterministic, explainable, auditable, workspace-isolated and independently releasable; AI may assist but must not become required for core correctness.
