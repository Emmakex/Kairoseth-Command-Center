# Project status / Estado del proyecto

**Current phase:** Phase 3 — Operational core  
**Product:** Kairoseth Command Center  
**Category:** Kairoseth Software  
**Status:** First operational vertical slice validated in PR #3; Phase 3 remains in progress.

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

### Phase 3 — first validated slice
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

## Validation / Validación

PR #3 CI run #16 passed the first Phase 3 slice quality gate after fixing the strict Mongo scope-filter typing issue without weakening TypeScript:

- [x] lint.
- [x] TypeScript validation.
- [x] automated tests.
- [x] production build.
- [x] dependency audit.
- [x] secret scan.
- [x] Docker Compose build/runtime smoke test.
- [x] API readiness/liveness smoke test.
- [x] ES/EN web route smoke test.

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
7. Today only aggregates data categories for which the session has explicit read capability.

## Next / Siguiente

1. Merge PR #3 when the documentation-only follow-up CI remains green.
2. Continue Phase 3 with task/project lifecycle updates and Milestones.
3. Add Alerts, Decisions and Timeline.
4. Build Quick Capture and the first ES/EN Today UI against the operational API.
5. Add a safe standalone local-auth/bootstrap flow.
6. Close Phase 3 only when the product is useful manually without GitHub or another external integration.

## Current blockers / Bloqueos actuales

None.

## Operating rule

Update this file at meaningful milestones. Do not use it as a substitute for detailed issues/roadmap; it is the concise project snapshot.
