# Project status / Estado del proyecto

**Current phase:** Phase 3 — Operational core  
**Product:** Kairoseth Command Center  
**Category:** Kairoseth Software  
**Status:** PR #4 merged; milestone slice implemented on `feat/phase-3-milestones` and pending CI validation.

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

### Phase 3 — operational foundation merged
- [x] Operational domain and scoped Mongo persistence.
- [x] Projects and Tasks create/list flows.
- [x] Today aggregate with timezone-aware day boundaries.
- [x] Strict workspace/private scope derivation from the authenticated session.
- [x] Product entitlement and capability enforcement.
- [x] PR #3 merged with the complete CI/security/Docker gate green.

### Phase 3 — operational actions merged
- [x] Project status/progress mutation flow.
- [x] Task status/completion mutation flow.
- [x] Alert create/list/acknowledge/resolve/dismiss lifecycle.
- [x] Workspace-only Decision Log create/list flow.
- [x] Server-authored Timeline audit events and scoped timeline reads.
- [x] Quick Capture for workspace/private projects and tasks.
- [x] Project completion forces progress to 100%.
- [x] Task completion records `completedAt` and clears it when reopened.
- [x] Alert lifecycle timestamps acknowledgement/resolution.
- [x] Mutation routes cannot update records outside the derived scope.
- [x] PR #4 merged after lint, typecheck, tests, build, audit, secret scan and Docker smoke passed.

### Phase 3 — milestone slice implemented
- [x] Added `milestones.read` and `milestones.write` capabilities.
- [x] Added milestone Mongo persistence and scoped indexes.
- [x] Added milestone create/list/status API routes as a modular route package.
- [x] Milestones support workspace and strict private-user scopes.
- [x] Milestone creation verifies the referenced project exists in the same scope.
- [x] Weighted milestones automatically recalculate project progress.
- [x] Cancelled milestones are excluded from weighted project progress.
- [x] Milestone mutations write server-authored Timeline events.
- [x] Added tests for scope injection, weighted progress, private/workspace isolation and read-only permissions.
- [x] Added a composed API application layer so new route modules can be added without growing the core `app.ts` indefinitely.

## Validation / Validación

### PR #3
- [x] Full quality gate green.

### PR #4
- [x] Full quality gate green.

### Milestone slice
- [ ] Pull request opened.
- [ ] lint/typecheck/tests/build green.
- [ ] dependency audit green.
- [ ] secret scan green.
- [ ] Docker Compose smoke green.

## Phase 3 still pending / Pendiente de la fase 3

- [ ] Decision supersede/reverse lifecycle.
- [ ] First useful Today UI connected to the API.
- [ ] ES/EN operational UI for Quick Capture, projects, milestones, tasks, alerts and decisions.
- [ ] Local manual-use authentication/bootstrap suitable for standalone mode.
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
9. Timeline events are authored by the server for operational mutations; clients do not write arbitrary audit events.
10. Mutation endpoints return not found when the entity exists only outside the authenticated/requested scope.
11. A milestone can only reference a project found inside the same derived scope.
12. Milestone write permissions are separate from milestone read permissions.

## Next / Siguiente

1. Open the milestone PR and run the complete quality gate.
2. Fix strict typing/runtime issues without weakening scope enforcement.
3. Merge the milestone slice when all gates are green.
4. Implement standalone local authentication/bootstrap so the product is usable without an external identity provider.
5. Connect the first useful ES/EN Today UI to the authenticated API.
6. Add Decision lifecycle hardening and transaction/outbox consistency before closing Phase 3.

## Current blockers / Bloqueos actuales

None documented. Milestone CI validation is pending.

## Operating rule

Update this file at meaningful milestones. Do not use it as a substitute for detailed issues/roadmap; it is the concise project snapshot.
