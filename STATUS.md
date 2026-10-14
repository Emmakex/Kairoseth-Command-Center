# Project status / Estado del proyecto

**Current phase:** Phase 3 — Operational core  
**Product:** Kairoseth Command Center  
**Category:** Kairoseth Software  
**Status:** First operational vertical slice implemented on `feat/phase-3-operational-core`; CI validation pending.

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

### Phase 3 — implemented in current slice
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

## Validation pending / Validación pendiente

- [ ] Open Phase 3 PR.
- [ ] lint/typecheck/tests/build green.
- [ ] dependency audit green.
- [ ] secret scan green.
- [ ] Docker Compose smoke green with `@kcc/persistence`.

## Phase 3 still pending / Pendiente de la fase 3

- [ ] Milestone persistence/API.
- [ ] Alert creation/acknowledge/resolve flow.
- [ ] Decision log persistence/API.
- [ ] Timeline write/read flow.
- [ ] Quick capture.
- [ ] Task/project status updates and completion workflow.
- [ ] First useful Today UI connected to the API.
- [ ] Local manual-use authentication/bootstrap suitable for standalone mode.

## Security invariants

1. Manual APIs never accept a raw tenant/user ID as authorization scope.
2. `scope=workspace` resolves only to the active authenticated workspace.
3. `scope=private` resolves only to the authenticated user.
4. Product entitlement and capability checks are both enforced.
5. Mongo queries always include the scope boundary.
6. System/integration scope cannot be created through manual project/task endpoints.

## Next / Siguiente

1. Open the Phase 3 PR and run the full quality gate.
2. Fix any strict typing/persistence issues without relaxing scope checks.
3. Add update/completion flows for Projects and Tasks.
4. Add Alerts, Decisions and Timeline.
5. Build Quick Capture and the first ES/EN Today UI against the operational API.
6. Close Phase 3 only when the product is useful manually without GitHub or another external integration.

## Current blockers / Bloqueos actuales

None documented. CI validation for the first Phase 3 slice is pending.

## Operating rule

Update this file at meaningful milestones. Do not use it as a substitute for detailed issues/roadmap; it is the concise project snapshot.
