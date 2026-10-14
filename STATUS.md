# Project status / Estado del proyecto

**Current phase:** Phase 4 — GitHub integration  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Status:** Phase 3 standalone release boundary is fully green on `main`. PR #15 starts the first GitHub integration slice with normalized repository ↔ project links.

## Naming rule / Regla de naming

- **ES:** Gestor de Trabajo
- **EN:** Work Manager
- `Kairoseth Command Center` remains the technical/internal repository name.
- Public product names do **not** use `Kairoseth` as a prefix; Kairoseth is the vendor/catalog brand.
- ES and EN commercial names/descriptors are defined independently.

## Completed / Completado

### Phase 0 — Foundation
- [x] Product, architecture, portability, tenancy, security and commercial model documented.
- [x] ES/EN commercial naming rule documented.

### Phase 1 — Core shell
- [x] Portable monorepo, web/API/worker, ES/EN, Docker and CI baseline.
- [x] PR #1 merged.

### Phase 2 — Identity, workspaces and permissions
- [x] Server-side session context, workspaces, memberships, RBAC/capabilities and product entitlements.
- [x] Strict workspace/private boundaries and negative isolation tests.
- [x] PR #2 merged.

### Phase 3 — Operational product
- [x] Projects, Tasks, Alerts, Decisions and Timeline foundations.
- [x] Scoped MongoDB persistence and server-derived workspace/private boundaries.
- [x] Quick Capture and operational mutations.
- [x] Weighted Milestones with project progress recalculation.
- [x] Standalone login/bootstrap and authenticated Today dashboard.
- [x] ES/EN operational UI.
- [x] Milestone management and Decision Log UI.
- [x] Scoped Timeline/audit UI.
- [x] Validated Decision create/supersede/reverse lifecycle.
- [x] Transactional audit outbox, idempotent Timeline delivery and worker processing.
- [x] All current manual mutation families migrated to transactional audit delivery.
- [x] Persistent standalone multi-user identities and password lifecycle.
- [x] Route-level member denial, owner protection and stale-session invalidation.
- [x] Production-oriented standalone Docker profile.
- [x] Fail-closed runtime credentials/secrets.
- [x] Backup + SHA-256 + guarded restore tooling.
- [x] Standalone release smoke with backup/restore and post-restore authentication.
- [x] PR #13 merged and post-merge validated.
- [x] PR #14 merged as `c3d95397559ae0a6987601a5529bd502059fb270`.
- [x] Post-merge `main` CI #96 green.
- [x] Post-merge Local identities smoke #22 green.
- [x] Post-merge Standalone release gate #9 green.

**Phase 3 technical release boundary: CLOSED / CERRADA.**

## Phase 4 — GitHub integration

### Slice 1 — normalized repository links (PR #15)

Implemented/in progress:

- [x] Core normalized `IntegrationConnection` and `ExternalResource` contracts.
- [x] GitHub repository links represented as workspace-scoped `ExternalResource` records.
- [x] Canonical case-insensitive `owner/repository` external identity.
- [x] Server-built GitHub deep link; arbitrary client `url` is not persisted.
- [x] Same-workspace project validation before linking.
- [x] `integrations.manage` + `command-center` entitlement enforcement.
- [x] Workspace derived only from authenticated session.
- [x] Transactional repository link/unlink + audit-outbox event.
- [x] Mongo indexes for workspace/project/resource identity.
- [x] `GET /v1/integrations/github/repositories`.
- [x] `POST /v1/integrations/github/repositories`.
- [x] `DELETE /v1/integrations/github/repositories/:resourceId`.
- [x] Negative tests for member denial, foreign project, workspace isolation, arbitrary URL, duplicates and path-like owner/repository input.
- [x] Domain/integration/API documentation updated.
- [ ] Final PR #15 CI/type/test/build/Docker quality gate.
- [ ] Merge and post-merge validation.

Deliberately deferred to later Phase 4 slices:

- [ ] GitHub App/OAuth/PAT connection lifecycle.
- [ ] Secret reference configuration.
- [ ] Live repository existence/access validation.
- [ ] Manual sync and normalized default branch/latest commit.
- [ ] PR/issue/workflow/release ingestion.
- [ ] Verified GitHub webhooks.
- [ ] GitHub-derived alerts and automation rules.

## Security invariants

1. Workspace/private scope is derived from the authenticated session, never authorized by raw client tenant/user IDs.
2. Product entitlement and capability checks are server-enforced.
3. MongoDB queries include the applicable scope boundary.
4. Decisions are workspace-only and project/supersede references resolve inside the authenticated workspace.
5. Timeline events are server-authored and delivered idempotently through the transactional outbox.
6. Browser operational forms use fixed same-product proxies and cannot choose arbitrary upstream paths.
7. Standalone browser sessions are HTTP-only; bearer tokens are not persisted in browser storage.
8. Standalone passwords are never persisted in plaintext.
9. Password change/reset immediately invalidates older local sessions.
10. Normal members cannot administer identities; `members.manage` is required.
11. Standalone owner protection is enforced at the HTTP boundary.
12. Production-oriented standalone MongoDB is not published to the host.
13. Standalone required credentials/secrets fail closed when absent.
14. Runtime `.env` files are excluded from Docker build contexts.
15. Integration administration requires `integrations.manage`.
16. GitHub repository links are workspace-only and validate project references in the same workspace.
17. A raw external resource ID, repository name or client-supplied URL never grants cross-workspace access.
18. GitHub link/unlink state and audit-outbox records commit atomically.
19. Provider credentials are not introduced in the repository-link slice.

## Next / Siguiente

1. Finish PR #15 validation and merge only when the complete quality gate is green.
2. Verify `main` after merge.
3. Implement the GitHub connection/authentication slice using secret references, not plaintext credentials.
4. Add live repository validation/manual sync.
5. Add normalized commit/PR/issue/workflow/release ingestion in separate slices.
6. When commercial publication is scheduled, create the Kairoseth Software catalog entry as **Gestor de Trabajo / Work Manager**.

## Current blockers / Bloqueos actuales

No known product blocker. PR #15 is the active development front.

## Operating rule

Update this file at meaningful milestones. Keep Phase 4 slices small; do not mix credentials, sync, webhooks and automation into the repository-link foundation.
