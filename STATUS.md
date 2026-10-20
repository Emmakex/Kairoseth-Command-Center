# Project status / Estado del proyecto

**Current phase:** Phase 7 — Governed Agent Bridge execution and security — **CLOSED / CERRADA**  
**Next phase:** not declared; future scope must be promoted explicitly.  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Current validated `main` boundary:** `39871f5ef662b8b5b44d14ac3a3363a48eabd4f3`, full 18-workflow post-merge regression green after PR #79.  
**Latest Phase 7 product slice:** safe paginated Agent Bridge execution history — backend PR #78 merged as `1db7699f77bbda85b56008d82c36373dd03a72cd`; ES/EN UI PR #79 merged as `39871f5ef662b8b5b44d14ac3a3363a48eabd4f3`.  
**Formal Phase 5 closure:** merged `main` `f327c584be4bc55deec710dc6e61d0746ae57958`.  
**Phase 7 closure evidence:** `docs/48-phase-7-release-boundary.md`.  
**Commercial catalog publication:** Kairoseth Platform PR #507 merged as `0d07c14894560096053498a32a4e14d12ec3f1ae` and deployed to Hostinger; later deployed platform revisions retain it in their ancestry.

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
- [x] Formal closure documentation merged in PR #60 as `f327c584be4bc55deec710dc6e61d0746ae57958`.

**Phase 5 technical release boundary: CLOSED / CERRADA.**

### Commercial publication / Publicación comercial

- [x] Kairoseth Software catalog entry created under independent commercial naming.
- [x] **ES:** Gestor de Trabajo.
- [x] **EN:** Work Manager.
- [x] Canonical catalog route: `/products/work-manager`.
- [x] `software` catalog area promoted to available.
- [x] ES/EN landing, metadata, structured data and sitemap entry added.
- [x] SEO copy oriented to validated demand around project management, task management and task organization while retaining the commercial name.
- [x] Growth lifecycle profile added to `content/growth/products.json` after the Product birth → Growth guard identified the missing profile.
- [x] Kairoseth Platform PR #507 passed Growth guard plus CI: editorial contract, lint, typecheck, full unit/acceptance suite, public-products responsive smoke, build and runtime smoke.
- [x] PR #507 merged as `0d07c14894560096053498a32a4e14d12ec3f1ae`.
- [x] Hostinger deployment acceptance directly observed deployed revision `0d07c14894560096053498a32a4e14d12ec3f1ae` before the platform advanced to later `main` revision `319b1c0873410af17e0a39812feab45861e4d738`.
- [x] Later Kairoseth Platform `main` retains the Work Manager merge in its ancestry and the canonical route remains present in source.

**Commercial catalog publication and deployment: COMPLETE / COMPLETADA.**

The initial Cargo production proof immediately after the merge failed while production was still serving an older revision. A later deployed-revision acceptance then observed the exact Work Manager merge `0d07c148...` and subsequently the next platform main `319b1c08...`, resolving the deployment-lag condition without any Work Manager code change.

### Phase 6 — Agent Bridge platform foundation and control plane

- [x] Shared durable A2A task/state storage.
- [x] Authenticated runtime enrollment and short-lived runtime sessions.
- [x] Session-bound heartbeat and authenticated runtime snapshots.
- [x] Workspace-scoped runtime observability with reduced connector/tool health projections.
- [x] Operator control/observability surfaces protected by server-side workspace authorization.
- [x] Runtime credentials, session material and connector-instance identity excluded from operator projections.

**Phase 6 foundation/control boundary: CLOSED / CERRADA.**

### Phase 7 — Governed Agent Bridge execution and security

Delivered:

- [x] READ command delivery and real `ProductionRuntime` acceptance.
- [x] Signed WRITE/CRITICAL approval path with Ed25519 approval material.
- [x] Mutation security hardening and runtime audit coverage.
- [x] Chained approval-key rotation with safe overlap/retirement.
- [x] ES/EN approval-key rotation control UI.
- [x] Safe workspace/installation-scoped operator tool inventory — PR #73 merged as `cf806c8b7dc1052dae8bc1471699cf2aad5acd1d`.
- [x] Governed ES/EN execution console — PR #75 merged as `8101a76d126026bc2b4a1c0eb46810cf1e4f47b5`.
- [x] Server-side risk derivation from authoritative runtime inventory; the browser cannot choose READ/WRITE/CRITICAL risk, approval tokens or execution endpoints.
- [x] Safe operator command projection removes runtime ACK session identity and correlation identity, and sanitizes secret-bearing reason/output before leaving the API.
- [x] Web layer retains a second defensive sanitizer rather than being the primary trust boundary.
- [x] Real console acceptance covers inventory → queue → `ProductionRuntime` → ACK for READ and signed mutation execution.
- [x] Post-console infrastructure regression fixed in PR #76 without changing the product standalone default: `mongo:8.0` remains default, while GitHub-hosted standalone acceptance uses compatible `mongo:7.0.43` through an explicit override.
- [x] Bounded tenant + installation scoped command-history persistence/query semantics and safe operator API — PR #78 merged as `1db7699f77bbda85b56008d82c36373dd03a72cd`.
- [x] ES/EN paginated execution-history UI with installation selection, 10 executions per page and safe command-detail links — PR #79 merged as `39871f5ef662b8b5b44d14ac3a3363a48eabd4f3`.
- [x] History API/UI acceptance proves runtime session IDs, correlation IDs, approval material, action fingerprints, key material, credentials and secret-bearing connector output cannot leak through the operator history surface.
- [x] Exact merged `main` `39871f5ef662b8b5b44d14ac3a3363a48eabd4f3` validated with the complete 18-workflow regression set; no failed, queued or in-progress workflow remained.
- [x] Closure evidence documented in `docs/48-phase-7-release-boundary.md`.

**Phase 7 technical release boundary: CLOSED / CERRADA.**

### Phase 7 release boundary / Cierre de Fase 7

The delivered boundary now includes governed READ and signed mutation execution, approval-key lifecycle, safe tool inventory, bilingual operator console, safe command projection and bounded paginated execution history. Retry/cancel is not part of the closed boundary and remains a separately scoped future capability.

No Phase 8 scope is declared by this closure. A next phase must be selected and documented explicitly rather than inferred from deferred backlog items.

## Deliberately deferred / Diferido expresamente

These are future roadmap candidates and do **not** block the closed Phase 7 boundary:

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
- [ ] Agent Bridge retry/cancel command semantics until a dedicated lifecycle, concurrency and idempotency contract is defined.

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
17. Agent Bridge runtime tenant/installation identity is server-derived from authenticated runtime sessions.
18. Browser clients are never authoritative for Agent Bridge risk classification or approval policy.
19. WRITE/CRITICAL execution requires the server-side signed approval path; approval tokens/material never enter browser-controlled input.
20. Operator command responses exclude runtime session IDs and correlation IDs and sanitize secret-bearing reason/output before leaving the API.
21. Action fingerprints, approval key material, connector credentials and runtime tokens are not operator-renderable data.
22. Safe web sanitization is defense in depth; the API projection is the primary operator data boundary.
23. Agent Bridge execution-history queries remain tenant + installation scoped and bounded; history cursors expose no tenant, runtime-session, approval or credential material.
24. Cross-installation history entries are rejected at the web defensive parsing boundary.

## Next / Siguiente

1. Keep Phase 5, commercial publication, Phase 6 and Phase 7 as closed boundaries.
2. Do not infer a Phase 8 from deferred backlog; the next product phase requires explicit scope and acceptance criteria.
3. Keep Agent Bridge retry/cancel deferred until a dedicated lifecycle, race, idempotency and authorization contract is defined.
4. Preserve the 18-workflow full regression boundary for future security-sensitive Agent Bridge changes.
5. Keep public pricing deferred until the Cloud / Private Cloud / Self-Hosted resource and operating-cost profile is measured.
6. Any new capability must enter a separately documented phase or explicitly scoped maintenance slice.

## Current blockers / Bloqueos actuales

**None / Ninguno.** Phase 7 is closed at validated `main` `39871f5ef662b8b5b44d14ac3a3363a48eabd4f3`; the full 18-workflow post-merge regression is green, and no open issue or pull request remained when the closure boundary was prepared.

## Operating rule

Keep delivered runtime deterministic, explainable, auditable, workspace-isolated and independently releasable. Agent Bridge execution must remain server-governed: browser requests may express tool + input, but tenant scope, runtime identity, risk classification, approval policy and operator-safe result projection remain authoritative server concerns. Closed phases reopen only for regressions in already-delivered contracts; new capabilities require explicit scope and acceptance evidence.
