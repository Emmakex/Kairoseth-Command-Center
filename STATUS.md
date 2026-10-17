# Project status / Estado del proyecto

**Current phase:** Phase 5 — Automation and intelligence  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Status:** Phase 5 Slice 20 is merged as `18f97410a776d8414747e6a1c7212c4f6962d18a` and post-merge validated 13/13. Phase 5 Slice 21 — Project deadline alerts / Alertas de vencimiento de proyectos — is active.

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
- [x] Slice 13 — Dependency start readiness — PR #46 `1820cf457d5ca2c1eddc3b2f5e26287d940479c4`.
- [x] Slice 14 — Task reminders — PR #47 `e9c217af98d529d8720a41928f0257d08524df0e`.
- [x] Slice 15 — Task reminder materialization — PR #48 `2998e19e236d29e10a34dcd6ff59690317002eac`.
- [x] Slice 16 — Task reminder UI — PR #49 `2c3cb8a51d5e7973ec1a218a032625e1715e34c4`.
- [x] Slice 17 — Task recurrence — PR #53 `646e71f8481d2a3eb17fc23f8471d26c81ce0af8`.
- [x] Slice 18 — Task recurrence UI — PR #55 `7de3c8b17d8b9ed0b6ddfa05d445717d4fb6b332`.
- [x] Slice 19 — Task recurrence materialization — PR #56 `0805dddd1a076a7fddaf4594cde4a3411fb8d3ad`.
- [x] Slice 20 — Task deadline alerts — PR #57 `18f97410a776d8414747e6a1c7212c4f6962d18a`.

The current merged `main` boundary is validated 13/13 green, including CI, standalone release, reminder materialization, recurrence materialization, task deadline lifecycle and Agent Bridge A2A acceptance.

### Phase 5 Slice 20 — Task deadline alerts / Alertas de vencimiento de tareas

- [x] Deterministic overdue rule for active workspace/private tasks with valid `dueAt <= worker now`.
- [x] Stable fingerprint `task-deadline:<taskId>` and severity `urgent`.
- [x] Exact persisted task scope and project link preserved on derived alerts.
- [x] One alert per scoped task fingerprint via unique indexes.
- [x] `open`/`acknowledged` alerts auto-resolve when the task stops being overdue.
- [x] `resolved` alerts reopen without duplication when the task becomes overdue again.
- [x] `dismissed` remains human-authoritative and is never reopened automatically.
- [x] Create/reopen/auto-resolve transitions use transactional audit-outbox events.
- [x] Worker exposes independent `taskDeadlines` reconciliation metrics.
- [x] Pure tests and dedicated Docker lifecycle acceptance cover workspace/private scope, delivered audit, resolve, reopen, deduplication and dismissal persistence.
- [x] PR #57 merged as `18f97410a776d8414747e6a1c7212c4f6962d18a`; resulting `main` validated 13/13.

**Phase 5 Slice 20: CLOSED / CERRADA.**

## Active / Activo

### Phase 5 Slice 21 — Project deadline alerts / Alertas de vencimiento de proyectos

Implemented on `feat/phase-5-project-deadline-alerts` so far:

- [x] Deterministic overdue rule for workspace/private projects with valid `dueAt <= worker now` and status other than `done`/`archived`.
- [x] Stable fingerprint `project-deadline:<projectId>` and severity `urgent`.
- [x] Alert is materialized in the exact persisted project scope with `projectId = project.id`.
- [x] Existing scope-bound unique alert indexes guarantee one alert per project deadline fingerprint.
- [x] `open`/`acknowledged` alerts auto-resolve when the project is done, archived, missing or no longer overdue.
- [x] `resolved` alerts reopen on a later overdue state without creating a second alert record.
- [x] `dismissed` remains human-authoritative and is never reopened automatically.
- [x] Create, reopen and auto-resolve transitions use transactional audit-outbox events.
- [x] Worker exposes independent `projectDeadlines` reconciliation metrics alongside task deadlines/reminders/recurrence/integrations.
- [x] Pure tests cover scope, status/date eligibility, exact deadline instant and fingerprint stability.
- [x] Dedicated Docker smoke covers workspace/private creation, delivered audit, auto-resolve, reopen, exactly-one alert and dismissal persistence.
- [x] Product/security documentation in `docs/45-project-deadline-alerts.md` and documentation index.
- [ ] Final-head lint, typecheck, tests, build and complete regression workflow set including the new project deadline alert smoke.
- [ ] Merge exact validated head and revalidate resulting `main`.

**Phase 5 Slice 21: VALIDATION PENDING / VALIDACIÓN PENDIENTE.**

## Deliberately deferred / Diferido expresamente

- [ ] Milestone deadline alerts.
- [ ] Pre-deadline warning windows and configurable deadline severity.
- [ ] Monthly/calendar/weekday/local-wall-clock recurrence semantics.
- [ ] Recurring reminder rules inherited or regenerated for future occurrences.
- [ ] Email, push, SMS or third-party reminder/alert delivery.
- [ ] Snooze/repeat policies.
- [ ] Dedicated graph visualization or drag-and-drop dependency editor.
- [ ] Automatic task status mutations driven by dependency changes.
- [ ] Critical-path duration forecasting or probabilistic deadline prediction.
- [ ] Arbitrary user-authored conditions or executable rule DSL.
- [ ] Automation actions beyond current in-app alert and recurrence behavior.
- [ ] AI-generated rules, weights, thresholds, dependencies, reminders, recurrence or silent priority changes.
- [ ] GitHub App/OAuth and additional providers.

## Security and correctness invariants

1. Workspace/private scope is server-derived from authenticated context for user mutations.
2. Product entitlement and capability checks are server-enforced.
3. Provider credentials never enter durable reminder/recurrence/deadline state, alerts or related audit events.
4. Derived automation and prioritization remain deterministic, explainable and AI-independent.
5. Private scope never crosses workspace dependency, reminder, recurrence or deadline-alert data.
6. Human `dismissed` alert state remains authoritative for task/project deadline automation.
7. Task dependencies reference local same-scope task IDs only and remain acyclic.
8. A task cannot be explicitly started while any same-scope dependency is not `done` at the guard check.
9. Reminder intent and reminder time are explicit user-authored data; no AI inference occurs.
10. Reminder mutation and mutation audit commit atomically.
11. Reminder execution preserves the task's persisted workspace/private scope.
12. Done/cancelled tasks and system scope never materialize reminders.
13. A one-time reminder creates at most one durable alert for its task+instant fingerprint.
14. Materialization consumes the exact one-time rule so later worker ticks do not repeatedly scan fired reminders.
15. Reminder materialization uses optimistic task concurrency and does not silently overwrite concurrent human edits.
16. Reminder alert creation and `alert.reminder_due` audit commit atomically.
17. Browser reminder forms cannot choose tenant, actor or authoritative time zone.
18. Reminder UI conversion uses the authenticated session IANA time zone and rejects non-existent local wall-clock times.
19. Recurrence intent is explicit user-authored data and cannot choose tenant or actor authority.
20. Enabling recurrence requires a persisted valid `dueAt` anchor.
21. Recurrence mutation and `task.recurrence_changed` audit commit atomically with optimistic task concurrency.
22. Browser recurrence forms can choose only recurrence mode and interval; tenant and actor authority remain server-derived.
23. Recurrence materialization runs only after explicit task completion and preserves the exact persisted workspace/private scope.
24. Each completed recurrence occurrence can create at most one direct successor; source link, successor and `task.recurrence_materialized` audit commit atomically.
25. A recurrence successor does not inherit one-time reminder instants, occurrence-specific dependencies, completion state or prior lineage.
26. Fixed-day recurrence currently means exact 24-hour UTC increments; monthly/weekday/local-calendar semantics are not implied.
27. Task/project deadline alerts use persisted entity scope and deadline only; browser input cannot choose derived alert tenant or actor.
28. Each deadline fingerprint creates at most one alert in its exact workspace/private scope.
29. Deadline create/reopen/auto-resolve transitions and their audit records commit transactionally.
30. A dismissed task/project deadline alert remains dismissed even while its entity remains overdue.

## Next / Siguiente

1. Validate Slice 21 final head with lint, typecheck, tests, build and the complete workflow set including project deadline alerts acceptance.
2. Correct any persistence/worker/Docker regression directly on this slice without broadening scope.
3. Merge the exact validated head and revalidate resulting `main`.
4. Select the next Phase 5 micro-slice only from the resulting green repository state; milestone deadlines remain the next adjacent deterministic gap.
5. Keep pre-deadline windows, configurable severity, recurring reminders, external delivery, snooze/repeat, calendar recurrence semantics, graph visualization, automatic dependency status behavior, critical-path forecasting, arbitrary DSL, AI changes, OAuth and additional providers as separate fronts.
6. When commercial publication is scheduled, create the Kairoseth Software catalog entry as **Gestor de Trabajo / Work Manager**.

## Current blockers / Bloqueos actuales

No known product blocker. Slice 21 is ready for regression validation.

## Operating rule

Update this file at meaningful milestones. Keep Phase 5 deterministic, explainable, auditable, workspace-isolated and independently releasable; AI may assist but must not become required for core correctness.
