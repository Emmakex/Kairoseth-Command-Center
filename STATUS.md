# Project status / Estado del proyecto

**Current phase:** Phase 5 — Automation and intelligence  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Status:** Phase 5 Slice 11 is merged as `fc9670d00579d4a9e2a59753326e5506a0067308` and post-merge validated 9/9. Phase 5 Slice 12 — Task dependency UI / UI de dependencias entre tareas — is active.

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
- [x] Slice 11 — Dependency-aware prioritization — PR #43 `fc9670d00579d4a9e2a59753326e5506a0067308`.

Every resulting `main` boundary through Slice 11 was validated with all nine workflows green.

### Phase 5 Slice 11 — Dependency-aware prioritization / Priorización por dependencias

- [x] Explicit dependency graph contributes deterministic priority impact for unique active downstream dependents.
- [x] Stable `task.dependency_impact` reason exposes count and contribution.
- [x] Configurable `taskDependencyImpactPerDependent`, default `10`, range `0..100`.
- [x] Legacy 15-field stored weight policies inherit the new default without destructive migration.
- [x] ES/EN weight editor and priority explanation support the new signal.
- [x] PR #43 final head `aeab53d06f2b4b24475dc542c5dc4dd24f4110c4` validated 9/9.
- [x] Merged as `fc9670d00579d4a9e2a59753326e5506a0067308`; resulting `main` validated 9/9.

**Phase 5 Slice 11: CLOSED / CERRADA.**

## Active / Activo

### Phase 5 Slice 12 — Task dependency UI / UI de dependencias entre tareas

Implemented on `feat/phase-5-task-dependency-ui` so far:

- [x] `TaskSummary` exposes optional `dependencyIds` while legacy tasks render as no dependencies.
- [x] Every ES/EN task card displays current dependency task titles.
- [x] Multiple selector offers only other tasks from the already server-scoped Today task set.
- [x] Empty selection clears all dependencies.
- [x] Existing same-origin `/api/operations` proxy is reused; browser forms do not call the backend directly.
- [x] Web mutation parser now supports guarded `PUT` mutations with string-array bodies.
- [x] `task-dependencies` parser enforces maximum 50, non-empty/<=100-character unique IDs and rejects self-reference.
- [x] Parser rejects unexpected authority fields such as `workspaceId`, `userId` or `actorUserId`.
- [x] Backend remains authoritative for same-scope existence, cycles, capabilities, entitlement, transactionality and audit.
- [x] Responsive management layout added for dependency controls.
- [x] Parser tests cover multi-dependency update, clear-all, self-reference, duplicates, >50 and authority-field rejection.
- [x] Product/security documentation in `docs/36-task-dependency-ui.md`.
- [ ] Final-head regression validation.
- [ ] Merge and post-merge `main` validation.

**Phase 5 Slice 12: VALIDATION PENDING / VALIDACIÓN PENDIENTE.**

## Deliberately deferred / Diferido expresamente

- [ ] Dedicated graph visualization or drag-and-drop dependency editor.
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
5. Private scope never crosses workspace dependency graphs.
6. Human dismissed decisions remain authoritative.
7. Legacy stored prioritization policies preserve configured values while inheriting new defaults.
8. Task dependencies reference local same-scope task IDs only and remain acyclic.
9. Dependency scoring uses only explicit stored graph edges; no text/AI inference occurs.
10. Completed/cancelled work does not create dependency impact.
11. Every dependency score contribution is exposed through stable reason code `task.dependency_impact`.
12. Final priority scores remain capped at `100`.
13. The dependency UI is convenience only; backend validation remains authoritative.
14. Browser dependency mutations cannot supply tenant or actor authority fields.

## Next / Siguiente

1. Validate Slice 12 final head with lint, typecheck, tests, build and all existing regression workflows.
2. Correct any UI/parser regression directly on this slice.
3. Merge the exact validated head and revalidate resulting `main`.
4. Select the next isolated Phase 5 slice only from the resulting green repository state.
5. Keep graph visualization, automatic status behavior, arbitrary DSL, AI changes, OAuth and additional providers as separate fronts.
6. When commercial publication is scheduled, create the Kairoseth Software catalog entry as **Gestor de Trabajo / Work Manager**.

## Current blockers / Bloqueos actuales

No known product blocker. Slice 12 is ready for regression validation.

## Operating rule

Update this file at meaningful milestones. Keep Phase 5 deterministic, explainable, auditable, workspace-isolated and independently releasable; AI may assist but must not become required for core correctness.
