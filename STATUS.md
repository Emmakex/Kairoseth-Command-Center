# Project status / Estado del proyecto

**Current phase:** Phase 3 — Operational core  
**Product:** Kairoseth Command Center  
**Category:** Kairoseth Software  
**Status:** PR #10 merged; post-merge main CI #49 green. Transactional audit outbox hardening is in progress on PR #11.

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

### Phase 3 — transactional audit outbox in progress
- [x] Durable `audit_outbox` model with leases, retries, backoff and failed terminal state.
- [x] Idempotent Timeline delivery keyed by event ID.
- [x] Worker drains audit outbox instead of heartbeat-only polling.
- [x] Decision create/supersede/reverse writes state + audit outbox records in one Mongo transaction.
- [x] Portable Docker MongoDB runs as single-node `rs0` replica set for transaction support.
- [x] CI Docker smoke includes replica-set check and end-to-end outbox-to-Timeline delivery.
- [ ] Full PR #11 quality gate green on final head.
- [ ] Extend transactional outbox coverage to the remaining manual mutation families.

## Validation / Validación

- [x] PR #6 — full gate green; main CI #30 green.
- [x] PR #7 — full gate green; main CI #36 green.
- [x] PR #8 — full gate green; main CI #39 green.
- [x] PR #9 — full gate green; main CI #42 green.
- [x] PR #10 — full gate green; main CI #49 green.
- [ ] PR #11 — final validation pending.

## Phase 3 still pending / Pendiente de la fase 3

- [ ] Extend transaction/outbox consistency to Project, Task, Alert, Quick Capture and Milestone mutation families.
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
15. Timeline presentation follows the same workspace/private scope and hides raw technical metadata from the main dashboard.

## Next / Siguiente

1. Finish and validate PR #11 transactional outbox foundation.
2. Apply the same atomic audit pattern to Project, Task, Alert, Quick Capture and Milestone mutations.
3. Implement persistent multi-user local identity/password lifecycle.
4. Run the final standalone Phase 3 end-to-end release gate.
5. Publish Command Center under Kairoseth Software and begin Phase 4 GitHub integration.

## Current blockers / Bloqueos actuales

None documented. PR #11 is under CI validation.

## Operating rule

Update this file at meaningful milestones. Do not use it as a substitute for detailed issues/roadmap; it is the concise project snapshot.
