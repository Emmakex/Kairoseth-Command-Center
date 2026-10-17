# Project status / Estado del proyecto

**Current phase:** Phase 5 — Automation and intelligence — **CLOSED / CERRADA**  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Technical release boundary:** merged `main` `d7eb0769bfed765727a851635eca41006ee412c2`, validated 15/15 after Phase 5 Slice 22.

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
- [x] Slice 21 — Project deadline alerts — PR #58 `01ea5e29885ddac920d37a0b148bbbc2de8eed3a`.
- [x] Slice 22 — Milestone deadline alerts — PR #59 `d7eb0769bfed765727a851635eca41006ee412c2`.

### Phase 5 release boundary / Cierre de Fase 5

- [x] Configurable deterministic rules/automation delivered.
- [x] Cross-source operational signals delivered.
- [x] Explainable prioritization delivered with configurable weights and explicit reasons.
- [x] Task dependencies/start readiness delivered.
- [x] One-time reminders and materialization delivered.
- [x] Fixed-day recurrence and exactly-once materialization delivered.
- [x] Task, project and milestone overdue-alert lifecycles delivered.
- [x] Core correctness remains AI-independent.
- [x] Exact merged `main` after Slice 22 validated with the full 15-workflow regression set; no failed, queued or in-progress workflow remained.
- [x] Closure and future backlog documented in `docs/47-phase-5-release-boundary.md`.

**Phase 5 technical release boundary: CLOSED / CERRADA.**

## Deliberately deferred / Diferido expresamente

These are future roadmap candidates and do **not** block the Phase 5 release:

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
6. Human `dismissed` alert state remains authoritative for task/project/milestone deadline automation.
7. Task dependencies reference local same-scope task IDs only and remain acyclic.
8. A task cannot be explicitly started while any same-scope dependency is not `done` at the guard check.
9. Reminder intent/time and recurrence intent are explicit user-authored data; no AI inference occurs.
10. Reminder/recurrence/deadline lifecycle writes and their audit events preserve transactional boundaries.
11. One-time reminders and recurrence materialization are idempotent under repeated worker ticks.
12. Browser forms never choose authoritative tenant/actor scope.
13. Fixed-day recurrence means exact 24-hour UTC increments; calendar semantics are not implied.
14. Task/project/milestone deadline fingerprints create at most one alert in the exact persisted scope.
15. A dismissed deadline alert remains dismissed even while its entity remains overdue.
16. Milestone deadline `projectId` is contextual linkage; milestone scope remains the tenancy boundary.

## Next / Siguiente

1. Merge the Phase 5 release-boundary documentation only after the same regression gate stays green.
2. After the closure documentation is on `main`, move to release/commercial packaging rather than silently opening another Phase 5 feature.
3. Prepare the Kairoseth Software catalog publication as **Gestor de Trabajo** (ES) / **Work Manager** (EN).
4. Any deferred capability must enter a newly documented future phase or explicitly scoped maintenance slice.

## Current blockers / Bloqueos actuales

No known technical product blocker. The functional Phase 5 runtime boundary is green; only the formal closure-documentation PR is pending.

## Operating rule

Keep delivered runtime deterministic, explainable, auditable, workspace-isolated and independently releasable. Reopen Phase 5 only for a regression in an already-delivered Phase 5 contract; new capabilities require explicit future scope.
