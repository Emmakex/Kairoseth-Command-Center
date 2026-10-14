# Project status / Estado del proyecto

**Current phase:** Phase 4 — GitHub integration  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Status:** Phase 3 is closed. Phase 4 Slice 1 (normalized GitHub repository links) is merged and post-merge green. PR #16 is the active Slice 2 front: encrypted GitHub connections and credential lifecycle.

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
- [x] Persistent standalone multi-user identities and password lifecycle.
- [x] Production-oriented standalone Docker profile.
- [x] Backup + SHA-256 + guarded restore tooling.
- [x] PR #13 merged and post-merge validated.
- [x] PR #14 merged as `c3d95397559ae0a6987601a5529bd502059fb270`.
- [x] Post-merge `main` CI #96 green.
- [x] Post-merge Local identities smoke #22 green.
- [x] Post-merge Standalone release gate #9 green.

**Phase 3 technical release boundary: CLOSED / CERRADA.**

## Phase 4 — GitHub integration

### Slice 1 — normalized repository links (PR #15)

- [x] Normalized `IntegrationConnection` / `ExternalResource` domain contracts.
- [x] Workspace-scoped GitHub repository links stored as `ExternalResource`.
- [x] Canonical case-insensitive `owner/repository` external identity.
- [x] Server-built GitHub deep link; arbitrary client URLs are not persisted.
- [x] Same-workspace project validation.
- [x] `integrations.manage` + `command-center` entitlement enforcement.
- [x] Workspace derived from authenticated session.
- [x] Transactional link/unlink + audit outbox.
- [x] Dedicated GitHub repository-links Docker smoke.
- [x] PR #15 merged as `2c1219f4e0f6b7d568a1c0edb56026c1915ec121`.
- [x] Post-merge CI #104 green.
- [x] Post-merge Local identities smoke #30 green.
- [x] Post-merge Standalone release gate #17 green.
- [x] Post-merge GitHub repository links smoke #2 green.

**Slice 1: CLOSED / CERRADA.**

### Slice 2 — encrypted GitHub connections (PR #16)

Implemented in the active branch:

- [x] Optional runtime `KCC_INTEGRATION_SECRET_KEY` (32 bytes / 64 hex chars).
- [x] AES-256-GCM encrypted secret vault in separate `integration_secrets` collection.
- [x] Workspace ID + `secretRef` authenticated as AAD.
- [x] Plaintext token never persisted in `IntegrationConnection`.
- [x] `IntegrationConnection.secretRef` points to encrypted secret material only.
- [x] Create/list/rotate/delete GitHub connection API.
- [x] Public API redacts both token and `secretRef`; exposes `credentialConfigured` only.
- [x] `integrations.manage` + product entitlement required.
- [x] Missing vault key fails closed for connection management without breaking core Work Manager operation.
- [x] Credential rotation updates ciphertext transactionally and audits the mutation.
- [x] Connection delete removes encrypted secret transactionally.
- [x] Delete refuses while an `ExternalResource.connectionId` still references the connection.
- [x] Unit tests for capability denial, workspace derivation, response redaction and vault-unavailable behavior.
- [x] AES-GCM tests prove workspace/ref ciphertext rebinding is rejected.
- [x] Dedicated GitHub connection Docker smoke created.
- [x] Standalone compose and `.env.standalone.example` support optional vault key.
- [x] Integration/API documentation updated.
- [ ] Final PR #16 CI/type/test/build/Docker gates.
- [ ] Merge and post-merge validation.

Important semantic boundary: `status=active` currently means locally configured/enabled. It does **not** yet prove that GitHub accepted the credential.

### Deferred Phase 4 slices

- [ ] Slice 3: live GitHub credential validation + manual repository sync.
- [ ] Bind repository resources to a validated connection.
- [ ] Normalize default branch/latest commit.
- [ ] PR/issue/workflow/release ingestion.
- [ ] Verified GitHub webhooks.
- [ ] GitHub-derived alerts and automation rules.
- [ ] OAuth/GitHub App flow after the token-backed adapter boundary is proven.

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
19. Plaintext provider credentials are never persisted in domain documents or Mongo secret records.
20. Integration ciphertext is AES-256-GCM authenticated against workspace + secret reference.
21. The integration master key is runtime-only and must be stored separately from database backups.
22. API responses never expose provider token, `secretRef`, ciphertext, IV or auth tag.
23. Missing vault configuration disables credential-backed integration actions rather than weakening encryption.
24. Credential rotation/deletion and corresponding audit records commit transactionally.

## Next / Siguiente

1. Finish PR #16 validation and merge only when all five gates are green.
2. Verify the same gates on `main` after merge.
3. Implement Slice 3: live GitHub credential validation and manual repository sync.
4. Bind normalized repository resources to validated GitHub connections.
5. Continue commit/PR/issue/workflow/release normalization in separate slices.
6. When commercial publication is scheduled, create the Kairoseth Software catalog entry as **Gestor de Trabajo / Work Manager**.

## Current blockers / Bloqueos actuales

No known product blocker. PR #16 is the active development front.

## Operating rule

Update this file at meaningful milestones. Keep Phase 4 slices small; do not mix credential storage, live sync, webhook ingestion and automation rules in one PR.
