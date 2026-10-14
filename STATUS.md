# Project status / Estado del proyecto

**Current phase:** Phase 3 — Operational core  
**Product:** Kairoseth Command Center  
**Category:** Kairoseth Software  
**Status:** PR #8 merged and post-merge main CI #39 green. Scoped ES/EN Timeline/Audit UI is implemented on `feat/phase-3-timeline-ui` and ready for PR validation.

## Completed / Completado

### Phase 0 — Foundation
- [x] Product, architecture, portability, tenancy, security and commercial model documented.

### Phase 1 — Core shell
- [x] Portable monorepo, web/API/worker, ES/EN, Docker and CI baseline.
- [x] Phase 1 merged in PR #1.

### Phase 2 — Identity, workspaces and permissions
- [x] Server-side session context, workspaces, membership, RBAC/capabilities, product entitlements.
- [x] Strict workspace and private-user boundaries.
- [x] Local/Kairoseth Identity adapter contracts.
- [x] Cross-tenant/private negative tests.
- [x] Phase 2 merged in PR #2 with full CI/Docker gate green.

### Phase 3 — operational foundation/actions merged
- [x] Projects, Tasks, Alerts, Decisions and Timeline API/domain foundations.
- [x] Scoped Mongo persistence and server-derived workspace/private boundaries.
- [x] Project/Task mutations, Alert lifecycle, Quick Capture and server-authored Timeline events.
- [x] Product entitlement/capability enforcement and negative scope tests.
- [x] PR #3 and PR #4 merged with complete quality gates green.

### Phase 3 — weighted milestones merged
- [x] Milestone scoped persistence/API and separate read/write capabilities.
- [x] Same-scope project validation for milestone creation.
- [x] Weighted milestone progress recalculation; cancelled milestones excluded.
- [x] Server-authored Timeline events for milestone mutations.
- [x] PR #5 merged with full gate green; main CI #22 green.

### Phase 3 — standalone manual-use slice merged
- [x] Explicit standalone auth configuration with no production default password/secret.
- [x] Signed expiring HMAC sessions and local owner bootstrap through normal RBAC.
- [x] HTTP-only SameSite browser session cookie.
- [x] ES/EN login and authenticated Today dashboard.
- [x] Workspace/private Today switch with server-derived scope.
- [x] PR #6 merged; post-merge main CI #30 green.

### Phase 3 — operational Today UI merged
- [x] ES/EN Quick Capture for workspace/private projects and tasks.
- [x] Project status/progress controls.
- [x] Task start/block/complete controls.
- [x] Alert acknowledge/resolve/dismiss controls.
- [x] Fixed server-side mutation proxy with allowlisted operations and validation.
- [x] Responsive desktop/mobile controls.
- [x] PR #7 merged; post-merge main CI #36 green.

### Phase 3 — Milestone + Decision Log UI merged
- [x] Refactored Today into feature components instead of a monolithic page.
- [x] Added full scoped project catalog reader.
- [x] Added Milestone list/create/status management in workspace/private scope.
- [x] Added workspace-only Decision Log list/create UI with ES/EN copy and localized timestamps/statuses.
- [x] Private view explicitly explains Decision Log workspace-only behavior.
- [x] Decision creation browser proxy rejects private scope and does not forward project references until backend validation exists.
- [x] Historical unvalidated Decision project IDs are hidden unless they resolve in the authenticated workspace catalog.
- [x] PR #8 merged; post-merge main CI #39 green.

### Phase 3 — Timeline UI implemented
- [x] Added scoped `/v1/timeline` reader to the web application.
- [x] Added workspace/private Timeline panel driven only by server-authored events.
- [x] Localized known event types and status metadata in ES/EN.
- [x] Removed raw status suffixes from status-change summaries when safe to do so.
- [x] Timeline dates respect the authenticated user locale/timezone with safe timezone fallback.
- [x] Main dashboard does not expose actor IDs, tenant IDs, source internals or raw event JSON.
- [x] Today limits presentation to the 30 most recent events while the scoped API can return up to 100.
- [x] Added responsive Timeline styles and semantic `time` elements.
- [x] Updated UX documentation with Timeline scope, privacy and progressive-disclosure rules.

## Validation / Validación

### PR #6 — Standalone + Today
- [x] Full quality gate green.
- [x] Merged to `main`; post-merge CI #30 green.

### PR #7 — Operational Today UI
- [x] Full quality gate green.
- [x] Merged to `main`; post-merge CI #36 green.

### PR #8 — Milestone + Decision Log UI
- [x] Full quality gate green, including final documentation rerun.
- [x] Merged to `main`; post-merge CI #39 green.

### Timeline UI slice
- [ ] Pull request opened.
- [ ] lint/typecheck/tests/build green.
- [ ] dependency audit green.
- [ ] secret scan green.
- [ ] Docker Compose smoke green.

## Phase 3 still pending / Pendiente de la fase 3

- [ ] Decision same-workspace project-reference validation plus supersede/reverse lifecycle.
- [ ] Persistent multi-user local identities and password lifecycle beyond the single-owner bootstrap.
- [ ] Transaction/outbox hardening for mutation + Timeline audit consistency.

## Security invariants

1. Manual APIs never accept a raw tenant/user ID as authorization scope.
2. `scope=workspace` resolves only to the active authenticated workspace.
3. `scope=private` resolves only to the authenticated user.
4. Product entitlement and capability checks are both enforced.
5. Mongo queries always include the scope boundary.
6. System/integration scope cannot be created through manual operational endpoints.
7. Today only aggregates data categories for which the session has explicit read capability.
8. Decisions are workspace-only and cannot be stored in private scope.
9. Timeline events are authored by the server; clients do not write arbitrary audit events.
10. Mutation endpoints return not found when the entity exists only outside the authenticated/requested scope.
11. A milestone can only reference a project found inside the same derived scope.
12. Standalone browser sessions are HTTP-only and the browser does not persist bearer tokens in local storage.
13. Operational browser forms post only to a fixed same-product server proxy and cannot choose arbitrary upstream API paths.
14. Decision creation through the browser proxy is workspace-only and does not forward project references until backend referential validation exists.
15. Timeline presentation follows the same server-derived workspace/private scope and hides raw technical metadata from the main dashboard.

## Next / Siguiente

1. Open and validate the Timeline UI PR; merge only when the full gate is green.
2. Implement Decision same-workspace project validation and supersede/reverse lifecycle.
3. Add transaction/outbox consistency hardening for mutation + Timeline audit writes.
4. Add the persistent multi-user local identity/password lifecycle needed beyond bootstrap mode.
5. Close Phase 3 only when the standalone product is useful manually end-to-end.
6. Publish Command Center under Kairoseth Software when the Phase 3 exit gate is met, then begin Phase 4 GitHub integration.

## Current blockers / Bloqueos actuales

None documented. Timeline UI is ready for PR validation.

## Operating rule

Update this file at meaningful milestones. Do not use it as a substitute for detailed issues/roadmap; it is the concise project snapshot.
