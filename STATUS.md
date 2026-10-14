# Project status / Estado del proyecto

**Current phase:** Phase 3 — Operational core  
**Product:** Kairoseth Command Center  
**Category:** Kairoseth Software  
**Status:** PR #8 open; Milestone management + workspace Decision Log UI are complete with the full CI/security/Docker gate green. Final documentation-only CI rerun is pending before merge.

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
- [x] Milestone scoped persistence/API and separate read/write capabilities.
- [x] Same-scope project validation for milestone creation.
- [x] Weighted milestone progress recalculation; cancelled milestones excluded.
- [x] Server-authored Timeline events for milestone mutations.
- [x] Milestone scope/permission/progress tests.
- [x] PR #5 merged with full gate green; main CI #22 green.

### Phase 3 — standalone manual-use slice merged
- [x] Explicit standalone auth configuration with no production default password/secret.
- [x] Signed expiring HMAC sessions and local owner bootstrap through normal RBAC.
- [x] HTTP-only SameSite browser session cookie.
- [x] ES/EN login and authenticated Today dashboard.
- [x] Workspace/private Today switch with server-derived scope.
- [x] Live project/task/alert metrics and lists.
- [x] PR #6 merged; post-merge main CI #30 green.

### Phase 3 — operational Today UI merged
- [x] ES/EN Quick Capture for workspace/private projects and tasks.
- [x] Project status/progress controls.
- [x] Task start/block/complete controls.
- [x] Alert acknowledge/resolve/dismiss controls.
- [x] Localized statuses, severities and mutation feedback.
- [x] Fixed server-side mutation proxy; HTTP-only bearer credential never reaches client code.
- [x] Allowlisted operation parser with scope/enum/range/encoded-ID validation and negative tests.
- [x] Responsive desktop/mobile controls.
- [x] PR #7 merged; post-merge main CI #36 green.

### Phase 3 — milestone + Decision Log UI implemented
- [x] Refactored Today from a monolithic page into feature components for Quick Capture, operational panels, Milestones and Decisions.
- [x] Added full scoped project catalog reader instead of reusing Today’s limited project list.
- [x] Added Milestone list/create/status management in workspace and private scope.
- [x] Milestone creation uses only projects returned from the same authenticated scope.
- [x] Added workspace-only Decision Log list/create UI with ES/EN copy and localized timestamps/statuses.
- [x] Private view replaces Decision Log with an explicit workspace-only explanation.
- [x] Decision creation proxy rejects private scope.
- [x] Decision project association is intentionally read-only/not offered for new decisions until API same-workspace reference validation is implemented.
- [x] Historical unvalidated Decision project IDs are not rendered unless they resolve in the authenticated workspace catalog.
- [x] Added parser tests for milestone mutations and Decision workspace/private boundaries.
- [x] Updated UX documentation with the new feature/component boundaries.

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
- [x] Full quality gate green, including final ES/EN rerun.
- [x] Merged to `main`.
- [x] Post-merge `main` CI #36 green.

### PR #8 — Milestone + Decision Log UI
- [x] Pull request opened.
- [x] lint/typecheck/tests/build green.
- [x] dependency audit green.
- [x] secret scan green.
- [x] Docker Compose smoke green, including API readiness and ES/EN web routes.
- [ ] Final documentation-only CI rerun green.
- [ ] Merged to `main`.

## Phase 3 still pending / Pendiente de la fase 3

- [ ] Decision same-workspace project-reference validation plus supersede/reverse lifecycle.
- [ ] Manual Timeline/audit visibility in the UI.
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
18. Decision creation through the browser proxy is workspace-only and does not forward project references until backend referential validation exists.

## Next / Siguiente

1. Merge PR #8 when its final documentation-only CI rerun is green.
2. Implement Decision same-workspace project validation and supersede/reverse lifecycle.
3. Add a manual Timeline/audit surface and transaction/outbox consistency hardening.
4. Add the persistent multi-user local identity/password lifecycle needed beyond bootstrap mode.
5. Close Phase 3 only when the standalone product is useful manually end-to-end.
6. Publish Command Center under Kairoseth Software when the Phase 3 exit gate is met, then begin Phase 4 GitHub integration.

## Current blockers / Bloqueos actuales

None documented. PR #8 is pending its final documentation-only CI rerun before merge.

## Operating rule

Update this file at meaningful milestones. Do not use it as a substitute for detailed issues/roadmap; it is the concise project snapshot.
