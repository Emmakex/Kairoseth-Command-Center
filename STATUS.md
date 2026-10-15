# Project status / Estado del proyecto

**Current phase:** Phase 4 — GitHub integration  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Status:** Phase 3 is closed. Phase 4 Slices 1–4b are merged and post-merge validated. Slice 4c is the active front: durable provider-neutral signal history for the dashboard.

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
- [x] Delete refuses while an `ExternalResource.connectionId` references the connection.
- [x] Unit tests for permissions, redaction and ciphertext workspace/ref isolation.
- [x] Dedicated encrypted-connection Docker smoke.
- [x] Gitleaks false-positive fixture removed from PR history without adding scanner exceptions.
- [x] PR #16 merged as `79053390c192c3b906847e2dab735ecf91d51531`.
- [x] Post-merge CI #111, Local identities #37, Standalone #24, Repository links #9 and GitHub connections #7 green.

**Slice 2: CLOSED / CERRADA.**

### Slice 3 — live validation + manual repository sync (PR #17)

- [x] Trusted deployment-level `KCC_GITHUB_API_BASE_URL`, defaulting to `https://api.github.com`.
- [x] Isolated `GitHubRestClient` with bearer auth, provider timeout and normalized error categories.
- [x] New/rotated credentials become `unverified`; only provider validation promotes to `active`.
- [x] Validated repository binding and manual repository sync.
- [x] Normalized repository/default-branch/latest-commit snapshot.
- [x] Provider errors and validation/sync audit paths normalized without credential leakage.
- [x] Strict GitHub HTTP mock and dedicated live validation/sync Docker smoke.
- [x] PR #17 final head passed all six gates and merged as `2e9062b373bcef4ffea407eecfe7863c1b5336f4`.
- [x] Post-merge `main` validation completed without a failed gate.

**Slice 3: CLOSED / CERRADA.**

### Slice 4a — normalized dashboard signals (PR #18)

- [x] Normalize pull requests, issues and Actions workflow runs into provider-neutral `IntegrationSignal`.
- [x] Exclude PRs returned by GitHub's issues endpoint to prevent duplicate signals.
- [x] `GET /v1/integrations/github/repositories/:resourceId/signals?limit=20`.
- [x] Require `projects.read` + `command-center` entitlement for signal consumption.
- [x] Derive workspace, repository coordinates and encrypted credential server-side.
- [x] Sort combined signals by latest provider activity and cap the response at 50.
- [x] Normalize provider 401 and invalidate the affected connection without credential leakage.
- [x] Tolerate historical workflow runs without `head_branch`.
- [x] API Docker image includes the `@kcc/integrations` workspace dependency.
- [x] PR #18 final head `a06246f1d4844d5baf50b9b5bd210ec2299ae1cb` passed all six gates.
- [x] PR #18 merged as `570bc0154fa167a9f3ee84d3dba93bb406757d9b` and post-merge validated.

**Slice 4a: CLOSED / CERRADA.**

### Slice 4b — normalized release signals (PR #19)

- [x] Normalize GitHub published releases, prereleases and drafts.
- [x] Tolerate nullable release `name` and `published_at` fields.
- [x] Map releases to existing `repository.release` `IntegrationSignal`.
- [x] Use `published_at` when available and `created_at` otherwise.
- [x] Include releases in the existing repository signal endpoint and global recent-first ordering.
- [x] Provider/API tests cover release normalization and draft/null-field behavior.
- [x] PR #19 final head `e6b4454933d33a3f1737d0af41b51cb43ac4735f` passed all six gates.
- [x] PR #19 merged as `4a6619f84c55b67aa211014a46b85062d739fbae`.
- [x] Post-merge `main` started six workflows; all completed with no failure or cancellation.

**Slice 4b: CLOSED / CERRADA.**

### Slice 4c — durable provider-neutral signal history

Implemented in the active branch:

- [x] Add Mongo `integration_signals` store using the provider-neutral `IntegrationSignal` contract.
- [x] Unique idempotency boundary `{ workspaceId, id }`.
- [x] Flatten `resourceId` and `projectId` into internal indexed fields while preserving public provider-neutral payloads.
- [x] Track first `ingestedAt` and latest local `updatedAt` internally.
- [x] Reject signal writes whose workspace does not match the authenticated server path.
- [x] Persist the complete normalized GitHub signal set after every successful live refresh.
- [x] Add provider-neutral `GET /v1/integrations/signals` history endpoint.
- [x] Filter history by resource, project and supported signal type; default 50/max 100 results.
- [x] Derive history workspace from the authenticated session and require `projects.read` + product entitlement.
- [x] Bootstrap signal indexes with the API runtime.
- [x] Update worker Docker context for the new `@kcc/persistence` → `@kcc/integrations` dependency.
- [x] Add API tests for durable refresh wiring, history filtering, workspace isolation and authorization.
- [x] Add ES/EN persistence architecture documentation.
- [ ] Open PR and complete CI/type/test/build/security/Docker gates.
- [ ] Merge and post-merge validation.

### Deferred Phase 4 slices

- [ ] Scheduled/retryable sync jobs and rate-limit-aware backoff.
- [ ] Verified GitHub webhooks.
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
15. Validation, sync and signal reads derive credentials and repository coordinates server-side.
16. A repository may use credential-backed reads only through a same-workspace connection with `active` + `lastValidatedAt`.
17. Provider responses are normalized before persistence or client exposure.
18. Provider errors are reduced to stable error categories; raw provider bodies are not returned.
19. Credential rotation returns a connection to `unverified` and clears prior validation metadata.
20. A provider 401 during sync or signal retrieval marks the connection invalid; repo-specific access errors do not silently invalidate it.
21. Signal consumption is read-only and requires `projects.read`; integration configuration remains restricted to `integrations.manage`.
22. Release timestamps are provider-derived; `created_at` is used only when `published_at` is absent.
23. Durable signal identity is workspace-scoped; repeated provider refreshes upsert rather than duplicate the same signal.
24. Persisted history queries always include the authenticated workspace boundary.
25. Internal ingestion/index metadata is not exposed through the public signal contract.

## Next / Siguiente

1. Open and validate the Slice 4c persistence PR.
2. Merge only when all final-head gates are green, then validate `main`.
3. Add scheduled/retryable refresh jobs and rate-limit-aware backoff as the next isolated slice.
4. Add verified webhooks only after scheduled durable ingestion is stable.
5. Add signal-derived alerts and rule automation only after event ingestion is durable.
6. When commercial publication is scheduled, create the Kairoseth Software catalog entry as **Gestor de Trabajo / Work Manager**.

## Current blockers / Bloqueos actuales

No known product blocker. Slice 4c durable signal history is the active development front.

## Operating rule

Update this file at meaningful milestones. Keep Phase 4 slices small; do not mix provider reads, persistence, scheduling, webhooks and automation rules in one PR.
