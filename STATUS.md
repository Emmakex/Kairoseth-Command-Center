# Project status / Estado del proyecto

**Current phase:** Phase 4 — GitHub integration  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Status:** Phase 3 is closed. Phase 4 Slices 1–4c are merged and post-merge validated. Slice 5a is the active front: durable provider-neutral integration sync jobs with leases and retry/backoff semantics.

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
- [x] PR #15 merged as `2c1219f4e0f6b7d568a1c0edb56026c1915ec121` and validated.

**Slice 1: CLOSED / CERRADA.**

### Slice 2 — encrypted GitHub connections (PR #16)

- [x] AES-256-GCM encrypted provider credential vault with workspace/ref AAD.
- [x] Create/list/rotate/delete GitHub connection API with redacted responses.
- [x] Missing vault key fails closed for credential-backed actions.
- [x] Transactional credential lifecycle and audit delivery.
- [x] PR #16 merged as `79053390c192c3b906847e2dab735ecf91d51531` and post-merge validated.

**Slice 2: CLOSED / CERRADA.**

### Slice 3 — live validation + manual repository sync (PR #17)

- [x] Trusted GitHub provider base URL and normalized provider client/errors.
- [x] Provider credential validation with `unverified → active` lifecycle.
- [x] Validated repository binding and manual repository sync.
- [x] Normalized repository/default-branch/latest-commit snapshot.
- [x] Strict GitHub HTTP mock and dedicated live validation/sync Docker smoke.
- [x] PR #17 merged as `2e9062b373bcef4ffea407eecfe7863c1b5336f4` and post-merge validated.

**Slice 3: CLOSED / CERRADA.**

### Slice 4a — normalized dashboard signals (PR #18)

- [x] Normalize pull requests, issues and Actions workflow runs into provider-neutral `IntegrationSignal`.
- [x] Exclude PRs returned by GitHub's issues endpoint to prevent duplicate signals.
- [x] `GET /v1/integrations/github/repositories/:resourceId/signals?limit=20`.
- [x] Require `projects.read` + `command-center` entitlement.
- [x] Derive workspace, repository coordinates and encrypted credential server-side.
- [x] Sort signals by provider activity and tolerate historical workflow runs without a branch.
- [x] PR #18 merged as `570bc0154fa167a9f3ee84d3dba93bb406757d9b` and post-merge validated.

**Slice 4a: CLOSED / CERRADA.**

### Slice 4b — normalized release signals (PR #19)

- [x] Normalize published releases, prereleases and drafts.
- [x] Tolerate nullable release `name` and `published_at`.
- [x] Map releases to `repository.release` with provider-derived timestamps.
- [x] PR #19 merged as `4a6619f84c55b67aa211014a46b85062d739fbae` and post-merge validated.

**Slice 4b: CLOSED / CERRADA.**

### Slice 4c — durable provider-neutral signal history (PR #20)

- [x] Mongo `integration_signals` store using provider-neutral `IntegrationSignal`.
- [x] Idempotent `{ workspaceId, id }` upserts with batch de-duplication.
- [x] Indexed internal `resourceId` / `projectId` fields and durable ingestion timestamps.
- [x] Reject cross-workspace writes and invalid signal IDs/timestamps.
- [x] Persist the complete normalized GitHub signal set after successful live refresh.
- [x] Provider-neutral `GET /v1/integrations/signals` history endpoint.
- [x] Resource/project/type filters with authenticated workspace isolation.
- [x] Runtime index bootstrap and worker Docker dependency graph updated.
- [x] API coverage for durable refresh, filters, isolation and authorization.
- [x] PR #20 final head `e49083ff039028d8f24fd3cd25531a6651ef51fe` passed all six gates.
- [x] PR #20 merged as `7b38bcf105a766ad39e697e181a634a0321c60ad`.
- [x] Post-merge `main` ran six workflows; all completed with no failure or cancellation.

**Slice 4c: CLOSED / CERRADA.**

### Slice 5a — durable integration sync job queue

Implemented in the active branch:

- [x] Provider-neutral Mongo `integration_sync_jobs` queue.
- [x] Job lifecycle: `pending → processing → completed`, retry path and terminal `dead` state.
- [x] Active-job dedupe boundary `{ workspaceId, dedupeKey }`.
- [x] Atomic oldest-due claim with random claim token and bounded lease.
- [x] Only the active claim holder may complete or retry a job.
- [x] Bounded exponential retry backoff: 30s base, 60m cap by default.
- [x] Configurable max attempts with hard cap of 20.
- [x] Expired processing leases requeue safely with normalized `lease_expired` error code.
- [x] Worker initializes queue indexes and repairs expired leases without claiming jobs yet.
- [x] Unit coverage for retry/backoff boundaries.
- [x] ES/EN architecture documentation for the queue and worker trust boundary.
- [ ] Open PR and complete CI/type/test/build/security/Docker gates.
- [ ] Merge and post-merge validation.

### Deferred Phase 4 slices

- [ ] Slice 5b: shared GitHub sync executor + worker job execution.
- [ ] Slice 5c: recurring schedule generation and provider rate-limit-aware `availableAt` handling.
- [ ] Verified GitHub webhooks.
- [ ] GitHub-derived alerts and rule automation.
- [ ] OAuth/GitHub App authorization flow after the token-backed adapter boundary is proven.

## Security invariants

1. Workspace/private scope is derived from authenticated/server-controlled context, never authorized by raw client tenant/user IDs.
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
16. Provider responses are normalized before persistence or client exposure.
17. Provider errors are reduced to stable error categories; raw provider bodies are not returned.
18. Durable signal identity is workspace-scoped; repeated provider refreshes upsert rather than duplicate.
19. Persisted history queries always include the authenticated workspace boundary.
20. Sync jobs never contain provider credentials or raw provider response bodies.
21. Active jobs are workspace-scoped and deduplicated by a server-generated semantic key.
22. Processing ownership is enforced with claim tokens and bounded leases.
23. Expired worker claims are recovered before future execution.
24. The worker does not claim integration jobs until the credential-backed executor exists as shared runtime code.

## Next / Siguiente

1. Validate and merge Slice 5a only when all final-head gates are green.
2. Extract a shared GitHub sync executor so API and worker use the same credential/repository/signal logic.
3. Enable worker claim/complete/retry against the durable queue.
4. Add recurring schedule generation and rate-limit-aware next-run/backoff semantics.
5. Add verified webhooks only after scheduled durable ingestion is stable.
6. Add signal-derived alerts/rules only after all ingestion paths are durable.
7. When commercial publication is scheduled, create the Kairoseth Software catalog entry as **Gestor de Trabajo / Work Manager**.

## Current blockers / Bloqueos actuales

No known product blocker. Slice 5a durable sync job queue is the active development front.

## Operating rule

Update this file at meaningful milestones. Keep Phase 4 slices small; do not mix queue infrastructure, credential-backed execution, recurring scheduling, webhooks and automation rules in one PR.
