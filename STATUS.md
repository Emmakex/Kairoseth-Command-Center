# Project status / Estado del proyecto

**Current phase:** Phase 3 — Operational core  
**Product:** Kairoseth Command Center  
**Category:** Kairoseth Software  
**Status:** PR #7 open; ES/EN Quick Capture plus project/task/alert operational controls are implemented. Initial full quality gate is green; final localization/documentation CI rerun is pending.

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

### Phase 3 — weighted milestones merged
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
- [x] PR #5 merged.
- [x] Main CI #22 green after merge.

### Phase 3 — standalone manual-use slice merged
- [x] Added explicit local standalone auth configuration with no production default password/secret.
- [x] Added signed, expiring HMAC session tokens.
- [x] Added local owner bootstrap using the normal owner RBAC preset and `command-center` entitlement.
- [x] Added `/v1/auth/local/login` without trusting client-provided scope IDs.
- [x] Added tests for successful login/session resolution, invalid credentials and token tampering.
- [x] Added HTTP-only SameSite session cookie in the Next.js layer.
- [x] Added ES/EN standalone login screen.
- [x] Connected the first useful Today UI to `/v1/session` and `/v1/today`.
- [x] Added workspace/private Today switch without sending tenant/user IDs as authorization scope.
- [x] Added live project/task/alert metrics and operational lists.
- [x] Added Docker/internal API runtime wiring and standalone-auth documentation.
- [x] PR #6 merged to `main`.
- [x] Main CI #30 green after merge.

### Phase 3 — operational UI slice implemented
- [x] Added ES/EN Quick Capture for workspace/private projects and tasks.
- [x] Added project status/progress controls.
- [x] Added task start/block/complete controls.
- [x] Added alert acknowledge/resolve/dismiss controls.
- [x] Added localized statuses, severities and mutation feedback.
- [x] Added responsive desktop/mobile operational controls.
- [x] Added a fixed server-side mutation proxy so the HTTP-only bearer credential never reaches client code.
- [x] Added an allowlisted operation parser with scope, enum, numeric range and encoded-ID validation.
- [x] Added tests for Quick Capture shape, path-injection resistance and invalid scope/status/progress rejection.

## Validation / Validación

### PR #3
- [x] Full quality gate green.

### PR #4
- [x] Full quality gate green.

### PR #5
- [x] Full quality gate green.
- [x] Post-merge `main` CI green.

### PR #6 — Standalone + Today
- [x] Full quality gate green.
- [x] Merged to `main`.
- [x] Post-merge `main` CI #30 green.

### PR #7 — Operational Today UI
- [x] Pull request opened.
- [x] Initial lint/typecheck/tests/build green.
- [x] Initial dependency audit green.
- [x] Initial secret scan green.
- [x] Initial Docker Compose smoke green, including API readiness and ES/EN web routes.
- [ ] Final localization/documentation CI rerun green.
- [ ] Merged to `main`.

## Phase 3 still pending / Pendiente de la fase 3

- [ ] Milestone management UI.
- [ ] Decision management UI plus supersede/reverse lifecycle.
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
9. Timeline events are authored by the server for operational mutations; clients do not write arbitrary audit events.
10. Mutation endpoints return not found when the entity exists only outside the authenticated/requested scope.
11. A milestone can only reference a project found inside the same derived scope.
12. Milestone write permissions are separate from milestone read permissions.
13. Standalone browser sessions are HTTP-only and the browser does not persist bearer tokens in local storage.
14. Standalone signed tokens bind to the server-configured local user/workspace and cannot select an arbitrary tenant.
15. Missing standalone credentials do not create an insecure default account.
16. Browser operational forms post only to a fixed same-product server proxy; they cannot choose an arbitrary upstream API path.
17. Operational proxy scope is limited to `workspace` or `private`, and entity IDs are URL-encoded before upstream routing.

## Next / Siguiente

1. Merge PR #7 when the final CI rerun is green.
2. Add Milestone management UI and Decision Log UI.
3. Add Decision supersede/reverse lifecycle and transaction/outbox consistency.
4. Add the persistent multi-user local identity/password lifecycle needed beyond bootstrap mode.
5. Close Phase 3 only when the standalone product is useful manually end-to-end.
6. Publish Command Center under Kairoseth Software when the Phase 3 exit gate is met, then begin Phase 4 GitHub integration.

## Current blockers / Bloqueos actuales

None documented. PR #7 is pending its final CI rerun after localization/documentation updates.

## Operating rule

Update this file at meaningful milestones. Do not use it as a substitute for detailed issues/roadmap; it is the concise project snapshot.
