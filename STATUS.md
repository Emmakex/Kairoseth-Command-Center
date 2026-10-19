# Project status / Estado del proyecto

**Current phase:** Phase 7 — Agent Bridge execution and security — **IN PROGRESS / EN CURSO**  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Phase 5 technical boundary:** `d7eb0769bfed765727a851635eca41006ee412c2`, formally closed in `f327c584be4bc55deec710dc6e61d0746ae57958`.  
**Commercial publication:** complete; canonical catalog route `/products/work-manager`.  
**Current Agent Bridge backend/trust boundary:** `951e8d30f7d8680441123adf8d9a7d974394a596`, with its full post-merge workflow set green.  
**Current development slice:** PR #70 — safe ES/EN approval-key rotation controls in the Agent Bridge operator surface.

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

### Phase 5 — Automation and intelligence

Delivered through 22 independently releasable slices:

- [x] Workspace automation policies and ES/EN administration UI.
- [x] Stale-work rules and configurable thresholds.
- [x] Deterministic explainable prioritization, delivery risk and configurable weights.
- [x] Task dependencies, dependency-aware ranking and start readiness.
- [x] One-time task reminders, worker materialization and ES/EN reminder UI.
- [x] Fixed-day task recurrence, ES/EN recurrence UI and exactly-once next-occurrence materialization.
- [x] Deterministic task, project and milestone deadline-alert lifecycles.
- [x] Transactional audit paths, exact workspace/private isolation and human-authoritative dismissal semantics.
- [x] Exact merged `main` after Slice 22 validated with the full 15-workflow regression set.
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
- [x] Growth lifecycle profile added after the Product birth → Growth guard identified the missing profile.
- [x] Kairoseth Platform PR #507 passed the product/Growth and platform CI gates.
- [x] PR #507 merged as `0d07c14894560096053498a32a4e14d12ec3f1ae` and Hostinger deployment acceptance observed that publication revision.

**Commercial catalog publication and deployment: COMPLETE / COMPLETADA.**

### Phase 6 — Agent Bridge Platform integration / Integración de Agent Bridge en Platform

- [x] Authoritative Mongo-backed A2A shared task storage for clustered runtimes — PR #50 / `4b2bfa241b8215658081fb11010190c332dfd62f`.
- [x] Tenant-scoped Agent Bridge observability foundation — PR #52 / `aa0e227baf0b83c42810c6d3f7d367cb0db46b41`.
- [x] Authoritative Agent Bridge control store.
- [x] Enrollment, session, heartbeat and authenticated runtime-snapshot routes.
- [x] Persistent runtime control state.
- [x] Runtime connectivity/readiness plus reduced connector/tool health observability.
- [x] ES/EN operator surface at `/{locale}/ia/agent-bridge`.
- [x] Real Agent Bridge control/observability acceptance and merged control-observability line in PR #54 / `b444c51bd6f41302d6abbd4d178a940336b23c82`.

**Phase 6 control/observability foundation: COMPLETE / COMPLETA.**

### Phase 7 — Agent Bridge execution and security / Ejecución y seguridad de Agent Bridge

#### Phase 7.2A — READ command delivery

- [x] Mongo-backed READ command delivery.
- [x] Runtime-session-bound pull/ACK lifecycle.
- [x] Deterministic action fingerprints.
- [x] Docker/Mongo acceptance against a real Agent Bridge control session — `5006e21516e38c9798a651e8352980c04c01e603`.
- [x] `ProductionRuntime` + WooCommerce acceptance hardening — `3f4b5c48879f09d2c3b83bb5462c432cde78675e`.

**Phase 7.2A: COMPLETE / COMPLETA.**

#### Phase 7.2B — Signed WRITE/CRITICAL execution + runtime audit

- [x] Per-workspace Ed25519 approval signer.
- [x] Approval private keys encrypted at rest through the existing integration-secret store.
- [x] Exact-action short-lived signed approval tokens for WRITE/CRITICAL.
- [x] Explicit operator mutation endpoint; approval tokens never appear in operator command projections.
- [x] Trusted public-key enrollment bootstrap and authenticated runtime key sync.
- [x] Durable, scope-checked, idempotent runtime audit ingestion.
- [x] Defensive redaction of bearer credentials, approval tokens, private-key material and secret assignments before durable audit persistence.
- [x] Negative coverage for tampering, injected approval tokens, invalid TTLs, session/generation errors and cross-scope audit batches.
- [x] Real acceptance proving WRITE + CRITICAL signing, Agent Bridge verification, tamper rejection, ACK, key sync, encrypted private-key persistence and sanitized audit delivery — `c3ce94a2e6cfde88e5b7676343138cde0288ab09` + `6d348b6ecce118f3e13a045311acec2420c05014`.

**Phase 7.2B: COMPLETE / COMPLETA.**

#### Chained approval-key rotation / Rotación encadenada de claves de aprobación

- [x] Explicit per-workspace generations.
- [x] Signed approval-keyset synchronization.
- [x] Per-installation/runtime generation acknowledgement.
- [x] Safe trust transition `old -> [old,new] -> [new]`.
- [x] Fail-closed handling when a runtime reports a generation ahead of Platform.
- [x] Old encrypted private key retired only after active runtimes converge.
- [x] Operator GET/POST API for rotation status/start.
- [x] ProductionRuntime acceptance incorporated into the command-delivery boundary.
- [x] Full post-merge workflow set green on `951e8d30f7d8680441123adf8d9a7d974394a596`.

**Rotation backend/trust-chain boundary: COMPLETE / COMPLETA.**

## Current work / Trabajo actual

### Phase 7 operator surface — approval-key rotation

PR #70 adds the missing operator surface on top of the already-complete rotation backend:

- [x] Safe response parser for rotation status.
- [x] ES/EN display of generation, phase and trusted-key count only.
- [x] No key IDs, PEM material or tokens rendered in the UI.
- [x] Same-origin POST proxy using the existing authenticated session cookie.
- [x] `workspace.manage` required before the rotation control is exposed.
- [x] Rotation button disabled while state is `overlap` or `retiring`.
- [x] Web unit coverage for malformed rotation projections.
- [ ] Full PR regression set green.
- [ ] Merge to `main` and post-merge verification.

## Deliberately deferred / Diferido expresamente

These are future roadmap candidates and do **not** reopen Phase 5 or block the delivered Phase 7 backend boundary:

- [ ] Pre-deadline warning windows and configurable deadline severity.
- [ ] Monthly/calendar/weekday/local-wall-clock recurrence semantics.
- [ ] Recurring reminder rules inherited or regenerated for future occurrences.
- [ ] Email, push, SMS or third-party reminder/alert delivery.
- [ ] Snooze/repeat policies.
- [ ] Dedicated graph visualization or drag-and-drop dependency editor.
- [ ] Automatic task status mutations driven by dependency changes.
- [ ] Critical-path duration forecasting or probabilistic deadline prediction.
- [ ] Arbitrary user-authored conditions or executable rule DSL.
- [ ] AI-generated rules, weights, thresholds, dependencies, reminders, recurrence or silent priority changes.
- [ ] GitHub App/OAuth and additional providers.

## Security and correctness invariants

1. Workspace/private scope is server-derived from authenticated context for user mutations.
2. Product entitlement and capability checks are server-enforced.
3. Provider credentials never enter durable operational state or related audit text.
4. Derived automation and prioritization remain deterministic, explainable and AI-independent.
5. Private scope never crosses workspace dependency, reminder, recurrence or deadline-alert data.
6. Human `dismissed` alert state remains authoritative for deadline automation.
7. Task dependencies reference local same-scope task IDs only and remain acyclic.
8. Reminder intent/time and recurrence intent are explicit user-authored data; no AI inference occurs.
9. Browser forms never choose authoritative tenant/actor scope.
10. Platform is the Agent Bridge control plane; Agent Bridge remains the execution/data plane.
11. Runtime sessions are bound to tenant + installation + bridge instance and expire independently of persistent installation identity.
12. READ/WRITE/CRITICAL risk remains explicit end-to-end.
13. WRITE/CRITICAL execution requires exact-action signed approval; operator-supplied approval tokens are rejected.
14. Approval private keys are encrypted at rest and are never exposed through operator APIs/UI or audit text.
15. Approval-key rotation advances only through signed generation synchronization and active-runtime convergence.
16. Runtime audit ingestion is session/scope checked, idempotent and defensively redacted before durable persistence.
17. Security-sensitive Phase 7 paths require real Agent Bridge acceptance in addition to unit/type/build checks.

## Next / Siguiente

1. Finish PR #70 and merge only after all repository checks are green.
2. Re-read `main` after the merge and record the final Phase 7 operator-surface SHA here and in `docs/10-roadmap.md`.
3. Continue Phase 7 only through bounded, evidenced slices; do not duplicate Agent Bridge runtime authority inside Platform.
4. Keep public pricing deferred until the Cloud / Private Cloud / Self-Hosted resource and operating-cost profile is measured.

## Current blockers / Bloqueos actuales

**No product-code blocker is known.** The current #70 implementation is waiting on the repository CI runner queue. A static review already corrected one relative-import defect before the valid CI head was evaluated.

## Operating rule

Keep delivered runtime deterministic, explainable, auditable, workspace-isolated and independently releasable. Platform remains the control/governance plane; Agent Bridge remains the execution/data plane. New capabilities require an explicit bounded slice, negative security coverage where relevant, and a green acceptance boundary before merge.
