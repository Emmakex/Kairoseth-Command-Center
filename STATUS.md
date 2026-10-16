# Project status / Estado del proyecto

**Current phase:** Phase 5 — Automation and intelligence  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Status:** Phase 5 Slice 12 is merged as `e33323da5abe83b74a0d4b5ceb9c491b1764fe0a` and post-merge validated 9/9. Phase 5 Slice 13 — Dependency start readiness / Preparación de inicio por dependencias — is active.

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
- [x] Slice 12 — Task dependency UI — PR #44 `e33323da5abe83b74a0d4b5ceb9c491b1764fe0a`.

Every resulting `main` boundary through Slice 12 was validated with all nine workflows green.

### Phase 5 Slice 12 — Task dependency UI / UI de dependencias entre tareas

- [x] ES/EN dependency editor on task cards.
- [x] Same-origin guarded mutation parser with authority-field rejection.
- [x] Backend remains authoritative for scope, existence, cycles, capability, entitlement and audit.
- [x] PR #44 merged as `e33323da5abe83b74a0d4b5ceb9c491b1764fe0a`; resulting `main` validated 9/9.

**Phase 5 Slice 12: CLOSED / CERRADA.**

## Active / Activo

### Phase 5 Slice 13 — Dependency start readiness / Preparación de inicio por dependencias

Implemented on `feat/phase-5-dependency-start-guard` so far:

- [x] Server-side pre-handler guards only transitions to `in_progress`.
- [x] Workspace/private scope is derived from the authenticated session.
- [x] `tasks.write` and `command-center` entitlement are enforced before dependency inspection.
- [x] Every explicit dependency must resolve in the same authenticated scope with status `done`.
- [x] Missing/foreign-scope dependency IDs are treated as incomplete and do not leak foreign task state.
- [x] Rejected starts return `409 task_dependencies_incomplete` with pending dependency IDs and perform no status mutation.
- [x] Explicit non-start transitions remain unchanged; no automatic blocking/start/completion is introduced.
- [x] Dependency editor now loads the complete scoped `/v1/tasks` catalog instead of the truncated 12-task Today list.
- [x] Completed dependency names remain visible; all same-scope task candidates are available.
- [x] ES/EN task cards show pending dependency names and disable Start as a convenience when pending dependencies are known.
- [x] Backend remains authoritative even if the browser is bypassed.
- [x] API tests cover rejection, successful start, cross-scope/missing dependency handling and unaffected non-start transitions.
- [x] Product/security documentation in `docs/37-dependency-start-readiness.md`.
- [ ] Final-head regression validation.
- [ ] Merge and post-merge `main` validation.

**Phase 5 Slice 13: VALIDATION PENDING / VALIDACIÓN PENDIENTE.**

## Deliberately deferred / Diferido expresamente

- [ ] Dedicated graph visualization or drag-and-drop dependency editor.
- [ ] Automatic task status mutations driven by dependency changes.
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
13. Browser dependency mutations cannot supply tenant or actor authority fields.
14. A task cannot be explicitly started while any same-scope dependency is not `done` at the guard check.
15. Dependency readiness never causes silent status mutation; users retain explicit control over status changes.
16. The dependency editor uses the full authenticated task catalog; Today truncation is not a dependency-authority boundary.

## Next / Siguiente

1. Validate Slice 13 final head with lint, typecheck, tests, build and all existing regression workflows.
2. Correct any API/UI regression directly on this slice.
3. Merge the exact validated head and revalidate resulting `main`.
4. Select the next isolated Phase 5 slice only from the resulting green repository state.
5. Keep graph visualization, automatic status behavior, critical-path forecasting, arbitrary DSL, AI changes, OAuth and additional providers as separate fronts.
6. When commercial publication is scheduled, create the Kairoseth Software catalog entry as **Gestor de Trabajo / Work Manager**.

## Current blockers / Bloqueos actuales

No known product blocker. Slice 13 is ready for regression validation.

## Operating rule

Update this file at meaningful milestones. Keep Phase 5 deterministic, explainable, auditable, workspace-isolated and independently releasable; AI may assist but must not become required for core correctness.
