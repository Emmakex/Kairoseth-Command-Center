# Project status / Estado del proyecto

**Current phase:** Phase 3 — Operational core  
**Product:** Kairoseth Command Center  
**Category:** Kairoseth Software  
**Status:** PR #11 merged; post-merge main CI #57 green. PR #12 is migrating the remaining manual mutation families to the transactional audit outbox pattern.

## Completed / Completado

### Phase 0 — Foundation
- [x] Product, architecture, portability, tenancy, security and commercial model documented.

### Phase 1 — Core shell
- [x] Portable monorepo, web/API/worker, ES/EN, Docker and CI baseline.
- [x] Phase 1 merged in PR #1.

### Phase 2 — Identity, workspaces and permissions
- [x] Server-side session context, workspaces, membership, RBAC/capabilities and product entitlements.
- [x] Strict workspace/private boundaries and negative isolation tests.
- [x] Phase 2 merged in PR #2 with full quality gate green.

### Phase 3 — operational foundation/actions
- [x] Projects, Tasks, Alerts, Decisions and Timeline API/domain foundations.
- [x] Scoped Mongo persistence and server-derived workspace/private boundaries.
- [x] Project/Task mutations, Alert lifecycle, Quick Capture and server-authored Timeline events.
- [x] PR #3 and PR #4 merged with complete quality gates green.

### Phase 3 — weighted milestones
- [x] Milestone persistence/API and separate read/write capabilities.
- [x] Same-scope project validation and weighted project progress recalculation.
- [x] PR #5 merged; main CI #22 green.

### Phase 3 — standalone manual use
- [x] Explicit standalone auth configuration with no production default password/secret.
- [x] Signed expiring HMAC sessions, local owner bootstrap and HTTP-only SameSite browser cookie.
- [x] ES/EN login + Today dashboard with workspace/private scope switch.
- [x] PR #6 merged; main CI #30 green.

### Phase 3 — operational UI
- [x] ES/EN Quick Capture for workspace/private projects and tasks.
- [x] Project status/progress, Task status and Alert lifecycle controls.
- [x] Fixed server-side mutation proxy with allowlisted operations and validation.
- [x] PR #7 merged; main CI #36 green.

### Phase 3 — Milestone + Decision Log UI
- [x] Feature-based Today components.
- [x] Full scoped project catalog and Milestone management UI.
- [x] Workspace-only Decision Log UI.
- [x] PR #8 merged; main CI #39 green.

### Phase 3 — Timeline/Audit UI
- [x] Scoped `/v1/timeline` web reader and workspace/private Timeline panel.
- [x] ES/EN known event labels, localized timestamps/statuses and privacy-safe presentation.
- [x] PR #9 merged; post-merge main CI #42 green.

### Phase 3 — validated Decision lifecycle
- [x] Same-workspace validation for Decision project references.
- [x] Active Decision supersede lifecycle with project inheritance/mismatch protection.
- [x] Active Decision reversal with required reason.
- [x] Conditional terminal transitions prevent double/repeated state changes.
- [x] Legacy `/v1/decisions` route cannot bypass validation with `projectId` or `supersedesId`.
- [x] ES/EN project/supersede/reverse controls in the Decision Log.
- [x] PR #10 merged; post-merge main CI #49 green.

### Phase 3 — transactional audit outbox foundation
- [x] Durable `audit_outbox` with leases, stale-lease recovery, retries/backoff and terminal failed state.
- [x] Idempotent Timeline delivery keyed by stable event ID.
- [x] Worker drains audit outbox and emits structured delivery telemetry.
- [x] Decision create/supersede/reverse writes domain state + audit outbox records in one MongoDB transaction.
- [x] Portable Docker MongoDB runs as single-node `rs0` replica set for transaction support.
- [x] CI verifies replica-set readiness and real Decision lifecycle outbox-to-Timeline delivery.
- [x] PR #11 merged; post-merge main CI #57 green.

### Phase 3 — operational transactional audit migration in progress
- [x] Atomic store implemented for Project create/status and Quick Capture project.
- [x] Atomic store implemented for Task create/status and Quick Capture task.
- [x] Atomic store implemented for Alert create/status.
- [x] Atomic store implemented for simple compatibility Decision creation.
- [x] Atomic store implemented for Milestone create/status with project progress recalculation inside the transaction.
- [x] Existing public URLs and response shapes retained through a fixed allowlisted pre-handler.
- [x] Tests prove the legacy mutation handlers do not execute after an atomic interception.
- [x] Tests cover private Quick Capture, Milestone hook ordering, Decision compatibility precedence and capability denial.
- [x] CI Docker smoke now verifies workspace Decision plus private Quick Capture delivery through the worker/outbox path.
- [ ] PR #12 final quality gate and merge.

## Validation / Validación

- [x] PR #6 — full gate green; main CI #30 green.
- [x] PR #7 — full gate green; main CI #36 green.
- [x] PR #8 — full gate green; main CI #39 green.
- [x] PR #9 — full gate green; main CI #42 green.
- [x] PR #10 — full gate green; main CI #49 green.
- [x] PR #11 — full gate green; main CI #57 green, including transactional Decision audit smoke.
- [ ] PR #12 — final head under validation; lint/typecheck/tests/build/audit/secrets green on CI #60, Docker smoke pending.

## Phase 3 still pending / Pendiente de la fase 3

- [ ] Merge and post-merge validate PR #12 so all current manual operational mutation families use atomic audit delivery.
- [ ] Persistent multi-user local identities and password lifecycle beyond the single-owner bootstrap.
- [ ] Final standalone end-to-end release gate and Kairoseth Software publication readiness.

## Security invariants

1. Manual APIs never accept raw tenant/user IDs as authorization scope.
2. `scope=workspace` resolves only to the active authenticated workspace.
3. `scope=private` resolves only to the authenticated user.
4. Product entitlement and capability checks are both enforced.
5. Mongo queries always include the scope boundary.
6. System/integration scope cannot be created through manual operational endpoints.
7. Decisions are workspace-only.
8. Decision project/supersede references resolve inside the authenticated workspace.
9. Legacy Decision creation cannot bypass validated lifecycle references.
10. Timeline events are server-authored; browser clients cannot write arbitrary audit records.
11. Operational browser forms post only to fixed same-product proxies and cannot choose arbitrary upstream paths.
12. Standalone browser sessions are HTTP-only and bearer tokens are not persisted in browser storage.
13. Transactionally hardened mutations write domain state and audit outbox records in the same MongoDB transaction.
14. Outbox delivery to Timeline is idempotent and safe to retry after worker interruption.
15. Atomic route interception preserves existing authorization/scope validation and prevents the legacy mutation handler from executing a second write.
16. Timeline presentation follows the same workspace/private scope and hides raw technical metadata from the main dashboard.

## Next / Siguiente

1. Finish PR #12 Docker smoke, merge it and verify post-merge `main` CI.
2. Implement persistent multi-user local identities and password lifecycle.
3. Run the final standalone Phase 3 end-to-end release gate.
4. Publish Command Center under Kairoseth Software and begin Phase 4 GitHub integration.

## Current blockers / Bloqueos actuales

None documented. PR #12 is under final CI validation.

## Operating rule

Update this file at meaningful milestones. Do not use it as a substitute for detailed issues/roadmap; it is the concise project snapshot.
