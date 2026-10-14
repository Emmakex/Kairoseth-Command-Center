# Project status / Estado del proyecto

**Current phase:** Phase 3 — Operational core  
**Product:** Kairoseth Command Center  
**Category:** Kairoseth Software  
**Status:** PR #3 merged; second Phase 3 slice implemented on `feat/phase-3-operational-actions` and pending CI validation.

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

### Phase 3 — first slice merged
- [x] Expanded operational domain for Projects, Milestones, Tasks, Alerts, Decisions and Timeline events.
- [x] Added `TodaySummary` domain model.
- [x] Added portable `@kcc/persistence` package.
- [x] Added scoped `OperationalStore` interface.
- [x] Added MongoDB implementation with tenant/private-aware filters and indexes.
- [x] Added project creation/listing API.
- [x] Added task creation/listing API.
- [x] Added first `/v1/today` aggregate endpoint.
- [x] Added user-timezone-aware local day boundaries for Today.
- [x] Server derives workspace/private scope from the authenticated session instead of trusting client IDs.
- [x] Added Command Center entitlement checks to operational endpoints.
- [x] Added `alerts.read`, `decisions.read/write` and `timeline.read` capabilities.
- [x] Added API tests proving client-supplied workspace/user IDs cannot escape the authenticated scope.
- [x] Added private-vs-workspace Today separation tests.
- [x] Wired Mongo operational store into the API runtime and Docker build.
- [x] Tightened Today so Projects, Tasks and Alerts each require their corresponding read capability.
- [x] PR #3 merged after the complete CI/security/Docker gate passed.

### Phase 3 — second slice implemented
- [x] Project status/progress mutation flow.
- [x] Task status/completion mutation flow.
- [x] Alert create/list/acknowledge/resolve/dismiss lifecycle.
- [x] Workspace-only Decision Log create/list flow.
- [x] Server-authored Timeline audit events and scoped timeline reads.
- [x] Quick Capture for projects and tasks.
- [x] Quick Capture supports workspace and strict private-user scope.
- [x] Project completion forces progress to 100%.
- [x] Task completion records `completedAt` and clears it when reopened.
- [x] Alert lifecycle timestamps acknowledgement/resolution.
- [x] Mutation routes use server-derived scope and cannot update a record in another scope.
- [x] Added operational lifecycle, decision, timeline and Quick Capture API tests.

## Validation / Validación

### First Phase 3 slice
PR #3 passed the complete quality gate:

- [x] lint.
- [x] TypeScript validation.
- [x] automated tests.
- [x] production build.
- [x] dependency audit.
- [x] secret scan.
- [x] Docker Compose build/runtime smoke test.
- [x] API readiness/liveness smoke test.
- [x] ES/EN web route smoke test.

### Second Phase 3 slice
- [ ] Pull request opened.
- [ ] lint/typecheck/tests/build green.
- [ ] dependency audit green.
- [ ] secret scan green.
- [ ] Docker Compose smoke green.

## Phase 3 still pending / Pendiente de la fase 3

- [ ] Milestone persistence/API.
- [ ] Decision supersede/reverse lifecycle.
- [ ] First useful Today UI connected to the API.
- [ ] ES/EN operational UI for quick capture, tasks, alerts and decisions.
- [ ] Local manual-use authentication/bootstrap suitable for standalone mode.
- [ ] Transaction/outbox hardening for mutation + timeline audit consistency.

## Security invariants

1. Manual APIs never accept a raw tenant/user ID as authorization scope.
2. `scope=workspace` resolves only to the active authenticated workspace.
3. `scope=private` resolves only to the authenticated user.
4. Product entitlement and capability checks are both enforced.
5. Mongo queries always include the scope boundary.
6. System/integration scope cannot be created through manual operational endpoints.
7. Today only aggregates data categories for which the session has explicit read capability.
8. Decisions are workspace-only and cannot be stored in private scope.
9. Timeline events are authored by the server for operational mutations; clients do not write arbitrary audit events.
10. Mutation endpoints return not found when the entity exists only outside the authenticated/requested scope.

## Next / Siguiente

1. Open the second Phase 3 PR and run the full quality gate.
2. Fix any strict typing or Mongo update issues without weakening scope enforcement.
3. Merge the operational actions slice when all gates are green.
4. Implement Milestones and the first connected ES/EN Today UI.
5. Add standalone local authentication/bootstrap for manual use.
6. Close Phase 3 only when the product is useful manually without GitHub or another external integration.

## Current blockers / Bloqueos actuales

None documented. CI validation for the second Phase 3 slice is pending.

## Operating rule

Update this file at meaningful milestones. Do not use it as a substitute for detailed issues/roadmap; it is the concise project snapshot.
