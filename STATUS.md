# Project status / Estado del proyecto

**Current phase:** Phase 5 — Automation and intelligence  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Status:** Phase 5 Slice 18 is merged as `7de3c8b17d8b9ed0b6ddfa05d445717d4fb6b332` and post-merge validated 11/11. Phase 5 Slice 19 — Task recurrence materialization / Materialización de recurrencia — is active.

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

The current merged `main` boundary is validated 11/11 green, including CI, standalone release, reminder materialization and Agent Bridge A2A acceptance.

### Phase 5 Slice 18 — Task recurrence UI / UI de recurrencia

- [x] ES/EN recurrence editor embedded in each existing task card.
- [x] Recurrence disabled or fixed whole-day interval from 1 through 365 days.
- [x] Persisted `dueAt` shown as recurrence anchor; enabling is disabled in UI when no valid anchor exists.
- [x] Clearing remains available independently of due-date presence.
- [x] Same-origin parser maps only to the guarded `PUT /v1/tasks/:id/recurrence` contract.
- [x] Strict form allow-list rejects authority-field injection and unsupported modes.
- [x] Web tests cover activation, clearing, bounds, fractions and authority rejection.
- [x] PR #55 merged as `7de3c8b17d8b9ed0b6ddfa05d445717d4fb6b332`; resulting `main` validated 11/11.

**Phase 5 Slice 18: CLOSED / CERRADA.**

## Active / Activo

### Phase 5 Slice 19 — Task recurrence materialization / Materialización de recurrencia

Implemented on `feat/phase-5-task-recurrence-materialization` so far:

- [x] Backward-compatible recurrence lineage fields on `Task`: `recurrenceSourceTaskId`, `recurrenceNextTaskId`, `recurrenceMaterializedAt`.
- [x] Deterministic eligibility: exact workspace/private scope, `done`, valid `completedAt`, valid `dueAt`, valid 1..365-day rule and no committed successor.
- [x] Next due date is derived as `sourceDueAt + intervalDays * 24h` from the persisted recurrence anchor.
- [x] Generated successor starts as `todo` and preserves stable template fields: scope, project, title, description, priority, assignees and recurrence rule.
- [x] One-time `reminderRules`, occurrence-specific `dependencyIds`, completion state and previous lineage are deliberately not copied.
- [x] Scope-bound unique index on `recurrenceSourceTaskId` prevents more than one direct successor for the same completed occurrence.
- [x] Source lineage marker, successor insertion and `task.recurrence_materialized` audit event commit atomically in one Mongo transaction.
- [x] Optimistic `updatedAt` matching prevents silent materialization over concurrent task edits.
- [x] Worker tick runs recurrence materialization independently alongside reminder materialization and existing GitHub work.
- [x] Pure tests cover candidate selection, invalid/system/already-materialized exclusions and fixed-day due-date arithmetic.
- [x] Dedicated Docker acceptance verifies exactly-one successor, source/child linkage, recurrence inheritance, stale reminder/dependency exclusion and delivered audit outbox.
- [x] Product/domain documentation in `docs/43-task-recurrence-materialization.md`, `docs/03-domain-data-model.md` and documentation index.
- [ ] Final-head lint, typecheck, tests, build and all regression workflows including the new recurrence materialization smoke.
- [ ] Merge exact validated head and revalidate resulting `main`.

**Phase 5 Slice 19: VALIDATION PENDING / VALIDACIÓN PENDIENTE.**

## Deliberately deferred / Diferido expresamente

- [ ] Monthly/calendar/weekday/local-wall-clock recurrence semantics.
- [ ] Recurring reminder rules inherited or regenerated for future occurrences.
- [ ] Email, push, SMS or third-party reminder delivery.
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
3. Provider credentials never enter durable reminder/recurrence state, alerts or related audit events.
4. Derived automation and prioritization remain deterministic, explainable and AI-independent.
5. Private scope never crosses workspace dependency, reminder or recurrence data.
6. Human dismissed decisions remain authoritative.
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
23. UI due-date disabling is convenience only; the API remains authoritative for recurrence correctness.
24. Recurrence materialization runs only after explicit task completion and preserves the exact persisted workspace/private scope.
25. Each completed recurrence occurrence can create at most one direct successor; source link, successor and `task.recurrence_materialized` audit commit atomically.
26. A recurrence successor does not inherit one-time reminder instants, occurrence-specific dependencies, completion state or prior lineage.
27. Fixed-day recurrence currently means exact 24-hour UTC increments; monthly/weekday/local-calendar semantics are not implied.
28. Recurring reminders and external delivery remain separate until explicitly implemented and validated.

## Next / Siguiente

1. Validate Slice 19 final head with lint, typecheck, tests, build and the complete workflow set including recurrence materialization acceptance.
2. Correct any persistence/worker/Docker regression directly on this slice without broadening scope.
3. Merge the exact validated head and revalidate resulting `main`.
4. Select the next Phase 5 micro-slice only from the resulting green repository state.
5. Keep recurring reminders, external delivery, snooze/repeat, monthly/weekday/local-time semantics, graph visualization, automatic dependency status behavior, critical-path forecasting, arbitrary DSL, AI changes, OAuth and additional providers as separate fronts.
6. When commercial publication is scheduled, create the Kairoseth Software catalog entry as **Gestor de Trabajo / Work Manager**.

## Current blockers / Bloqueos actuales

No known product blocker. Slice 19 is ready for regression validation.

## Operating rule

Update this file at meaningful milestones. Keep Phase 5 deterministic, explainable, auditable, workspace-isolated and independently releasable; AI may assist but must not become required for core correctness.
