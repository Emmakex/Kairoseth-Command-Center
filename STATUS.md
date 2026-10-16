# Project status / Estado del proyecto

**Current phase:** Phase 5 — Automation and intelligence  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Status:** Phase 5 Slice 4 is merged as `375b9d2ecef75243f6335732bd1f6e646df1c3f0` and post-merge validated 9/9. Phase 5 Slice 5 — Project/milestone priority risk / Riesgo de prioridad de proyectos e hitos — is active.

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

- [x] Normalized repository links and encrypted GitHub connections.
- [x] Live validation + manual repository sync.
- [x] Durable provider-neutral PR/issue/CI/release signal history.
- [x] Durable integration queue, worker retries and recurring reconciliation.
- [x] Verified GitHub webhooks with raw-body HMAC verification and replay protection.
- [x] Provider-neutral derived alerts with deterministic fingerprints.
- [x] Automatic derived-alert resolve/reopen lifecycle.
- [x] Workspace integration activity UI.
- [x] Admin GitHub setup and maintenance UI.
- [x] Manual webhook provision/rotate/remove UI with session-bound one-time secret reveal.
- [x] Final Phase 4 closure commit `d1bfa929b6b2aa409991949513218826f10c2bb0` validated with all nine workflows green.

**Phase 4 token-backed GitHub boundary: CLOSED / CERRADA.**

### Phase 5 Slice 1 — Automation rule policies / Políticas de reglas de automatización

- [x] Workspace-scoped enable/severity policies for versioned deterministic built-in CI rules.
- [x] `automation.manage`, guarded API, worker reconciliation and transactional audit lifecycle.
- [x] PR #33 merged as `3bda1db529e46e9f52ce1cf4cf4726495fa6a0e4`; resulting `main` validated 9/9.

**Phase 5 Slice 1: CLOSED / CERRADA.**

### Phase 5 Slice 2 — Automation rule policy UI / UI de políticas de reglas de automatización

- [x] ES/EN workspace administration surface for built-in automation rules.
- [x] Workspace-only `automation.manage` loading, safe same-origin mutation boundary and parser tests.
- [x] PR #34 merged as `37755e580fef985dfda96645f7ccc86704a84e08`; resulting `main` validated 9/9.

**Phase 5 Slice 2: CLOSED / CERRADA.**

### Phase 5 Slice 3 — Stale work rules / Reglas de trabajo sin actividad

- [x] `repository.pull_request.stale.v1` and `repository.issue.stale.v1`.
- [x] Fixed seven-day v1 inactivity threshold.
- [x] Both rules default disabled / warning to preserve behavior until explicit workspace opt-in.
- [x] Open-only evaluation; recent, closed, merged or disabled conditions resolve the stable fingerprint.
- [x] Evaluation-time occurrence semantics support later reopen without changing alert identity.
- [x] Worker reconciliation covers durable CI, PR and issue signals.
- [x] Existing policy API/web UI manages the new rules in ES/EN.
- [x] Unit/API/web parser coverage plus `docs/27-stale-work-rules.md`.
- [x] PR #35 merged as `1a88ae5280d0115fbdf2e61834859d6847bcc77e`.
- [x] Resulting `main` validated with all nine workflows green.

**Phase 5 Slice 3: CLOSED / CERRADA.**

### Phase 5 Slice 4 — Explainable prioritization / Priorización explicable

- [x] Deterministic ranking for active tasks and alerts with explicit score contributions.
- [x] Task signals: manual priority, blocked, overdue and due today.
- [x] Alert severity scores: critical 100, urgent 90, warning 60, info 30.
- [x] Scores capped at 100 with deterministic tie-breaking.
- [x] Authenticated `GET /v1/priorities` with server-derived workspace/private scope and timezone-aware day boundaries.
- [x] ES/EN Today panel showing top priorities and translated reasons.
- [x] Integration-derived alerts participate through the normalized operational alert model.
- [x] Unit/API coverage and `docs/28-explainable-prioritization.md`.
- [x] PR #36 merged as `375b9d2ecef75243f6335732bd1f6e646df1c3f0`.
- [x] Resulting `main` validated with all nine workflows green.

**Phase 5 Slice 4: CLOSED / CERRADA.**

## Active / Activo

### Phase 5 Slice 5 — Project/milestone priority risk / Riesgo de prioridad de proyectos e hitos

Implemented on `feat/phase-5-project-milestone-risk` so far:

- [x] Project and milestone entities participate in the same deterministic priority ranking as tasks and alerts.
- [x] Project risk contributions: blocked `+45`, overdue `+35`, due today `+20`.
- [x] Due/overdue projects receive up to `+20` for remaining progress using `round((100 - progress) * 0.2)`.
- [x] Projects that are `done`/`archived`, or active without blocked/due risk, do not create noise in the priority list.
- [x] Milestone risk contributions: overdue `+40`, due today `+25`, normalized weight up to `+20`.
- [x] Future milestones and `done`/`cancelled` milestones are excluded from this slice.
- [x] Stable project/milestone reason codes preserve exact explainability and the global 100-point cap.
- [x] Priority API now reads tasks, alerts, projects and milestones from the authenticated scope.
- [x] Priority API requires `tasks.read`, `alerts.read`, `projects.read`, `milestones.read` and the `command-center` entitlement.
- [x] ES/EN priority UI recognizes project/milestone kinds and translates every new reason.
- [x] Unit/API coverage for project risk, milestone risk, exclusions and combined ranking.
- [x] Architecture/product documentation in `docs/29-project-milestone-priority-risk.md`.
- [ ] Final-head regression validation.
- [ ] Merge and post-merge `main` validation.

**Phase 5 Slice 5: VALIDATION PENDING / VALIDACIÓN PENDIENTE.**

## Deliberately deferred / Diferido expresamente

- [ ] Customer-configurable prioritization weights.
- [ ] Dependency-chain scoring and dependency data-model/mutation work.
- [ ] Customer-configurable stale thresholds.
- [ ] Arbitrary user-authored conditions or rule DSL.
- [ ] Automation actions beyond current derived-alert behavior.
- [ ] AI-generated automation rules or priority changes.
- [ ] GitHub App/OAuth and additional providers.

## Security and correctness invariants

1. Workspace/private scope is server-derived from authenticated context.
2. Product entitlement and capability checks are server-enforced.
3. Provider credentials never enter durable jobs, signals, alerts, policies, prioritization or audit events.
4. Derived automation consumes normalized durable signals and remains provider-neutral.
5. Versioned rule IDs and deterministic alert fingerprints remain stable.
6. Private scope never loads workspace automation administration.
7. Existing CI rule defaults remain unchanged; stale-work rules remain opt-in by default.
8. Human dismissed decisions remain authoritative under the alert lifecycle.
9. Priority ranking is deterministic, explainable and does not require AI.
10. Every priority score contribution is returned as a stable reason code; the ES/EN UI translates reasons without changing scoring.
11. Priority API derives tenant/private scope from the authenticated session and now requires task, alert, project and milestone read capability.
12. Priority scoring does not mutate operational entities or external systems.
13. Project progress contributes only when a project is already due/overdue; incomplete future work does not become artificial risk.
14. Milestone weight contributes only when the milestone is due today or overdue; future milestones remain outside the attention list.
15. Dependency-chain scoring remains separate until dependency data is explicitly modelled and authorized.

## Next / Siguiente

1. Validate the final Slice 5 head with lint, typecheck, tests, build and all existing regression workflows.
2. Correct any project/milestone prioritization regression directly on this slice.
3. Merge the exact validated head and revalidate resulting `main`.
4. Continue Phase 5 only from the resulting green repository state.
5. Keep dependency chains, configurable weights, AI suggestions, external automation actions, OAuth and additional providers as separate fronts.
6. When commercial publication is scheduled, create the Kairoseth Software catalog entry as **Gestor de Trabajo / Work Manager**.

## Current blockers / Bloqueos actuales

No known product blocker. Slice 5 is ready for regression validation.

## Operating rule

Update this file at meaningful milestones. Keep Phase 5 deterministic, explainable, auditable, workspace-isolated and independently releasable; AI may assist but must not become required for core correctness.
