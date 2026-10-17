# Project status / Estado del proyecto

**Current phase:** Phase 5 — Automation and intelligence  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Status:** Phase 5 Slice 15 is merged as `2998e19e236d29e10a34dcd6ff59690317002eac` and post-merge validated 10/10. Phase 5 Slice 16 — Task reminder UI / UI de recordatorios — is active.

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

Slice 15 introduced a tenth dedicated regression gate. The resulting `main` boundary is validated 10/10 green.

### Phase 5 Slice 15 — Task reminder materialization / Materialización de recordatorios

- [x] Worker-side due-reminder materializer over explicit stored `{ kind: 'at' }` rules.
- [x] Workspace/private tasks only; system scope and done/cancelled tasks excluded.
- [x] Stable `task-reminder:<taskId>:<remindAt>` alert fingerprints.
- [x] Same-scope warning/open in-app alerts with scope-bound durable idempotence.
- [x] Transactional alert creation + `alert.reminder_due` audit-outbox event.
- [x] One-time rule consumed transactionally after materialization.
- [x] Optimistic task concurrency guard and duplicate-key race convergence.
- [x] Dedicated Docker smoke proves materialization, consumption, delivered audit and no duplicates.
- [x] PR #48 merged as `2998e19e236d29e10a34dcd6ff59690317002eac`; resulting `main` validated 10/10.

**Phase 5 Slice 15: CLOSED / CERRADA.**

## Active / Activo

### Phase 5 Slice 16 — Task reminder UI / UI de recordatorios

Implemented on `feat/phase-5-task-reminder-ui` so far:

- [x] Existing scoped task catalog exposes one-time `reminderRules` to the web UI.
- [x] Dynamic ES/EN reminder editor is embedded in each existing task card.
- [x] Up to 10 one-time reminder rows can be added/removed; an empty editor clears all reminders.
- [x] Workspace and private task surfaces reuse the existing guarded `PUT /v1/tasks/:id/reminders` endpoint.
- [x] Same-origin proxy accepts no client tenant/user/time-zone authority fields.
- [x] For reminder mutations, the proxy resolves the authenticated session and uses `session.user.timezone` as the authoritative IANA zone.
- [x] `datetime-local` values are converted to canonical UTC ISO before reaching the API.
- [x] Existing seconds are preserved by the editor/parser.
- [x] Time-zone conversion round-trips and rejects non-existent DST local times instead of silently shifting them.
- [x] Strict parser allow-list rejects unexpected authority fields, duplicates and more than 10 reminders.
- [x] Tests cover Madrid summer/winter conversion, seconds, spring-forward gap, sorting, clearing, duplicates, limits and authority rejection.
- [x] Product/security documentation in `docs/40-task-reminder-ui.md`.
- [ ] Final-head lint, typecheck, tests, build and all 10 regression workflows.
- [ ] Merge and post-merge `main` validation.

**Phase 5 Slice 16: VALIDATION PENDING / VALIDACIÓN PENDIENTE.**

## Deliberately deferred / Diferido expresamente

- [ ] Recurring reminder rules.
- [ ] Email, push, SMS or third-party reminder delivery.
- [ ] Snooze/repeat policies.
- [ ] Dedicated graph visualization or drag-and-drop dependency editor.
- [ ] Automatic task status mutations driven by dependency changes.
- [ ] Critical-path duration forecasting or probabilistic deadline prediction.
- [ ] Arbitrary user-authored conditions or executable rule DSL.
- [ ] Automation actions beyond current in-app alert behavior.
- [ ] AI-generated rules, weights, thresholds, dependencies, reminders or silent priority changes.
- [ ] GitHub App/OAuth and additional providers.

## Security and correctness invariants

1. Workspace/private scope is server-derived from authenticated context for user mutations.
2. Product entitlement and capability checks are server-enforced.
3. Provider credentials never enter durable reminder state, alerts or reminder audit events.
4. Derived automation and prioritization remain deterministic, explainable and AI-independent.
5. Private scope never crosses workspace dependency or reminder data.
6. Human dismissed decisions remain authoritative.
7. Task dependencies reference local same-scope task IDs only and remain acyclic.
8. A task cannot be explicitly started while any same-scope dependency is not `done` at the guard check.
9. Reminder intent and reminder time are explicit user-authored data; no AI inference occurs.
10. Reminder mutation and mutation audit commit atomically.
11. Reminder execution preserves the task's persisted workspace/private scope.
12. Done/cancelled tasks and system scope never materialize reminders.
13. A one-time reminder creates at most one durable alert for its task+instant fingerprint.
14. Materialization consumes the exact one-time rule so later worker ticks do not repeatedly scan fired reminders.
15. Materialization uses optimistic task concurrency and does not silently overwrite concurrent human edits.
16. Reminder alert creation and `alert.reminder_due` audit commit atomically.
17. Browser reminder forms cannot choose tenant, actor or authoritative time zone.
18. Reminder UI conversion uses the authenticated session IANA time zone and rejects non-existent local wall-clock times.
19. Recurrence and external delivery remain separate until explicitly implemented and validated.

## Next / Siguiente

1. Validate Slice 16 final head with lint, typecheck, tests, build and all 10 regression workflows.
2. Correct any web/parser/time-zone regression directly on this slice.
3. Merge the exact validated head and revalidate resulting `main`.
4. Select the next Phase 5 micro-slice only from the resulting green repository state and documented boundaries.
5. Keep recurring rules, external delivery, snooze/repeat, graph visualization, automatic status behavior, critical-path forecasting, arbitrary DSL, AI changes, OAuth and additional providers as separate fronts.
6. When commercial publication is scheduled, create the Kairoseth Software catalog entry as **Gestor de Trabajo / Work Manager**.

## Current blockers / Bloqueos actuales

No known product blocker. Slice 16 is ready for regression validation.

## Operating rule

Update this file at meaningful milestones. Keep Phase 5 deterministic, explainable, auditable, workspace-isolated and independently releasable; AI may assist but must not become required for core correctness.
