# Project status / Estado del proyecto

**Current phase:** Phase 4 — GitHub integration  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Status:** Phase 3 is closed. Phase 4 Slices 1–2 are merged and post-merge green. PR #17 is the active Slice 3 front: live GitHub credential validation, validated repository binding and manual repository sync.

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
- [x] PR #14 merged as `c3d95397559ae0a6987601a5529bd502059fb270` and post-merge validated.

**Phase 3 technical release boundary: CLOSED / CERRADA.**

## Phase 4 — GitHub integration

### Slice 1 — normalized repository links (PR #15)

- [x] Normalized `IntegrationConnection` / `ExternalResource` domain contracts.
- [x] Workspace-scoped GitHub repository links stored as `ExternalResource`.
- [x] Canonical case-insensitive `owner/repository` external identity.
- [x] Server-built GitHub deep link; arbitrary client URLs are not persisted.
- [x] Same-workspace project validation.
- [x] `integrations.manage` + `command-center` entitlement enforcement.
- [x] Transactional link/unlink + audit outbox.
- [x] Dedicated GitHub repository-links Docker smoke.
- [x] PR #15 merged as `2c1219f4e0f6b7d568a1c0edb56026c1915ec121`.
- [x] Post-merge CI #104, Local identities #30, Standalone #17 and Repository links #2 green.

**Slice 1: CLOSED / CERRADA.**

### Slice 2 — encrypted GitHub connections (PR #16)

- [x] Optional runtime `KCC_INTEGRATION_SECRET_KEY` (32 bytes / 64 hex chars).
- [x] AES-256-GCM encrypted vault in separate `integration_secrets` collection.
- [x] Workspace ID + `secretRef` authenticated as AAD.
- [x] Plaintext token never persisted in domain documents or Mongo secret records.
- [x] Create/list/rotate/delete GitHub connection API.
- [x] API redacts token, `secretRef`, ciphertext, IV and auth tag.
- [x] Missing vault key fails closed for credential operations without breaking core Work Manager features.
- [x] Transactional credential rotation/deletion and audit delivery.
- [x] Delete refuses while `ExternalResource.connectionId` references the connection.
- [x] Unit tests for permissions, redaction and ciphertext workspace/ref isolation.
- [x] Dedicated encrypted-connection Docker smoke.
- [x] Gitleaks false-positive fixture removed from PR history without adding scanner exceptions.
- [x] PR #16 merged as `79053390c192c3b906847e2dab735ecf91d51531`.
- [x] Post-merge CI #111 green.
- [x] Post-merge Local identities #37 green.
- [x] Post-merge Standalone #24 green.
- [x] Post-merge Repository links #9 green.
- [x] Post-merge GitHub connections #7 green.

**Slice 2: CLOSED / CERRADA.**

### Slice 3 — live validation + manual repository sync (PR #17)

Implemented in the active branch:

- [x] Trusted deployment-level `KCC_GITHUB_API_BASE_URL`, defaulting to `https://api.github.com`.
- [x] Isolated `GitHubRestClient` with bearer auth, provider timeout and normalized error categories.
- [x] `IntegrationConnectionStatus` now includes `unverified`.
- [x] New/rotated credentials become `unverified`; only provider validation promotes to `active`.
- [x] Generic validation fields: `lastValidatedAt`, remote account ID/label and normalized last error code.
- [x] `POST /v1/integrations/github/connections/:id/validate`.
- [x] Legacy `active` connections without `lastValidatedAt` cannot be bound until revalidated once.
- [x] Explicit repository → validated connection binding.
- [x] `PATCH /v1/integrations/github/repositories/:resourceId/connection`.
- [x] Manual repository sync by `resourceId`; token/owner/repository are resolved server-side.
- [x] `POST /v1/integrations/github/repositories/:resourceId/sync`.
- [x] Normalized sync snapshot includes GitHub repository ID, remote full name, default branch, latest commit SHA/URL/date, private/archived flags, remote update time and local sync time.
- [x] Validation success/failure, binding, sync success/failure audited without raw provider bodies or credentials.
- [x] Provider 401 discovered during sync invalidates the connection; repository-specific 403/404 does not automatically invalidate the credential.
- [x] Unit tests updated for `unverified → active` and validated binding.
- [x] Provider-adapter tests cover bearer URL, response normalization, rate limiting and malformed provider responses.
- [x] Strict GitHub HTTP mock added for Docker CI.
- [x] Dedicated live validation/sync Docker smoke and workflow added.
- [ ] Final PR #17 CI/type/test/build/security/Docker gates.
- [ ] Merge and post-merge validation.

### Deferred Phase 4 slices

- [ ] PR/issue/workflow/release ingestion and normalized dashboard signals.
- [ ] Verified GitHub webhooks.
- [ ] Scheduled/retryable sync jobs and rate-limit-aware backoff.
- [ ] GitHub-derived alerts and rule automation.
- [ ] OAuth/GitHub App authorization flow after the token-backed adapter boundary is proven.

## Security invariants

1. Workspace/private scope is derived from the authenticated session, never authorized by raw client tenant/user IDs.
2. Product entitlement and capability checks are server-enforced.
3. MongoDB queries include the applicable scope boundary.
4. Timeline/audit events are server-authored and delivered idempotently through the transactional outbox.
5. Standalone passwords and provider credentials are never persisted in plaintext.
6. Runtime `.env` files are excluded from Docker build contexts.
7. Integration administration requires `integrations.manage`.
8. GitHub repository links and connections are workspace-only.
9. Raw external IDs, repository names or client-supplied URLs never grant cross-workspace access.
10. Integration ciphertext is AES-256-GCM authenticated against workspace + secret reference.
11. The integration master key is runtime-only and stored separately from database backups.
12. Missing vault configuration disables credential-backed actions rather than weakening encryption.
13. Public API responses never expose provider token, `secretRef`, ciphertext, IV or auth tag.
14. GitHub provider base URL is deployment configuration, never HTTP request input.
15. Validation and sync calls derive credentials and repository coordinates server-side.
16. A repository may bind only to a same-workspace connection with `active` + `lastValidatedAt`.
17. Provider responses are normalized before persistence or client exposure.
18. Provider errors are reduced to stable error categories; raw provider bodies are not returned.
19. Credential rotation returns a connection to `unverified` and clears prior validation metadata.
20. A provider 401 during sync marks the connection invalid; repo-specific access errors do not silently invalidate it.

## Next / Siguiente

1. Finish PR #17 validation and merge only when all existing gates plus `GitHub live sync smoke` are green.
2. Verify the same gates on `main` after merge.
3. Start the next small slice for normalized PR/issue/workflow signals.
4. Add verified webhooks only after polling/manual normalization is stable.
5. When commercial publication is scheduled, create the Kairoseth Software catalog entry as **Gestor de Trabajo / Work Manager**.

## Current blockers / Bloqueos actuales

No known product blocker. PR #17 is the active development front.

## Operating rule

Update this file at meaningful milestones. Keep Phase 4 slices small; do not mix live sync, PR/issues/workflows, webhooks and automation rules in one PR.
