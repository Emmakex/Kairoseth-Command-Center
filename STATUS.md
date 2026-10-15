# Project status / Estado del proyecto

**Current phase:** Phase 4 — GitHub integration  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Status:** Phase 3 is closed. Phase 4 Slices 1–5e are merged. Slice 5f — derived alert lifecycle — is active in PR #28.

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
- [x] Quick Capture, Milestones, project progress and Decision lifecycle.
- [x] Standalone login/bootstrap, ES/EN Today dashboard and operational UI.
- [x] Scoped Timeline/audit UI and transactional audit outbox.
- [x] Persistent standalone multi-user identities and password lifecycle.
- [x] Production-oriented standalone Docker profile, backup and guarded restore tooling.
- [x] PR #13 merged and post-merge validated.
- [x] PR #14 merged as `c3d95397559ae0a6987601a5529bd502059fb270` and post-merge validated.

**Phase 3 technical release boundary: CLOSED / CERRADA.**

## Phase 4 — GitHub integration

### Slice 1 — normalized repository links (PR #15)
- [x] Workspace-scoped GitHub repository links as normalized `ExternalResource`.
- [x] Canonical repository identity, server-built deep links and project validation.
- [x] Capability/entitlement enforcement and transactional audit.
- [x] Dedicated repository-links Docker smoke.
- [x] Merged as `2c1219f4e0f6b7d568a1c0edb56026c1915ec121` and validated.

**Slice 1: CLOSED / CERRADA.**

### Slice 2 — encrypted GitHub connections (PR #16)
- [x] AES-256-GCM provider credential vault with workspace/ref AAD.
- [x] Create/list/rotate/delete API with redacted responses and fail-closed runtime configuration.
- [x] Merged as `79053390c192c3b906847e2dab735ecf91d51531` and validated.

**Slice 2: CLOSED / CERRADA.**

### Slice 3 — live validation + manual repository sync (PR #17)
- [x] Trusted provider client/error normalization and credential validation lifecycle.
- [x] Validated repository binding and manual sync.
- [x] Strict GitHub HTTP mock + live validation/sync Docker smoke.
- [x] Merged as `2e9062b373bcef4ffea407eecfe7863c1b5336f4` and validated.

**Slice 3: CLOSED / CERRADA.**

### Slice 4a — normalized dashboard signals (PR #18)
- [x] Provider-neutral PR/issue/CI signals with authenticated workspace isolation.
- [x] Merged as `570bc0154fa167a9f3ee84d3dba93bb406757d9b` and validated.

**Slice 4a: CLOSED / CERRADA.**

### Slice 4b — normalized release signals (PR #19)
- [x] Published/draft/prerelease normalization with provider-derived timestamps.
- [x] Merged as `4a6619f84c55b67aa211014a46b85062d739fbae` and validated.

**Slice 4b: CLOSED / CERRADA.**

### Slice 4c — durable provider-neutral signal history (PR #20)
- [x] Mongo `integration_signals` store with workspace-scoped idempotent upserts.
- [x] Durable resource/project/type history endpoint and isolation tests.
- [x] Merged as `7b38bcf105a766ad39e697e181a634a0321c60ad` and validated.

**Slice 4c: CLOSED / CERRADA.**

### Slice 5a — durable integration sync job queue (PR #21)
- [x] Provider-neutral durable queue with dedupe, leases, retries and dead-letter ceiling.
- [x] Merged as `5a0b15e31257b42777e7da4d32a79fc33dab0f27`.

**Slice 5a: CLOSED / CERRADA.**

### Slice 5b — credential-backed worker execution (PRs #22–#24)
- [x] Worker resolves provider credentials server-side and persists normalized signals.
- [x] Retryable/terminal provider failures separated; invalid credentials invalidate connections.
- [x] Queue → worker → provider → signal Docker acceptance path.
- [x] PR #23 merged as `156b0e86931b70cab090abe7e8b9b9090e4658e7`.
- [x] PR #24 merged as `ed1542f1e3402a0d5b3b6a09b740c83df94226ce`.

**Slice 5b: CLOSED / CERRADA.**

### Slice 5c — recurring GitHub refresh schedules (PR #25)
- [x] Durable schedules, cadence, leases, due-job enqueue and retry recovery.
- [x] Default 15-minute reconciliation cadence with no immediate duplicate refresh on discovery.
- [x] Dedicated recurring-refresh smoke.
- [x] Squash-merged as `715f441b8c4a69de3e1b9fd442c241798ec56302`; resulting `main` validated with eight workflows green.

**Slice 5c: CLOSED / CERRADA.**

### Slice 5d — verified GitHub webhooks (PR #26)
- [x] Opaque connection-scoped webhook endpoints and independent encrypted HMAC secret.
- [x] Raw-body HMAC-SHA256 verification, constant-time comparison and strict headers.
- [x] Durable delivery replay protection and tenant/connection-scoped repository resolution.
- [x] Webhook events enqueue authoritative provider refresh; payloads never become signal truth directly.
- [x] Recurring polling remains reconciliation/fallback.
- [x] Provision/read/rotate/delete management lifecycle and transactional audit.
- [x] Dedicated webhook Docker smoke and ninth CI gate.
- [x] PR #26 merged as `e51474854276d6ec73306be8c80f1b7450d583fa`.

**Slice 5d: CLOSED / CERRADA.**

### Slice 5e — provider-neutral derived alerts (PR #27)
- [x] Provider-neutral rules consume normalized `IntegrationSignal`, not raw GitHub payloads.
- [x] `repository.ci.failed.v1` derives `urgent` alerts for failure/timed_out/startup_failure.
- [x] `repository.ci.action_required.v1` derives `warning` alerts for action_required.
- [x] Deterministic versioned fingerprints and Mongo uniqueness guarantee idempotency.
- [x] First materialization emits transactional `alert.derived` audit work.
- [x] Repeated polling/webhook convergence does not duplicate alerts or Timeline events.
- [x] Background smoke processes the same failed CI signal set twice and proves one alert + one audit event.
- [x] Queue completion bug exposed by repeat processing fixed by migrating active-job dedupe from compound sparse to unique partial index.
- [x] Final PR head validated with all nine gates green.
- [x] PR #27 squash-merged as `e0b2e8d3454ddbfa1865ddc2031a0ae405220f66`.

**Slice 5e: CLOSED / CERRADA.**

## Active / Activo

### Slice 5f — derived alert lifecycle (PR #28)

Implemented on the active draft PR:

- [x] Existing v1 fingerprints remain unchanged; no fingerprint migration.
- [x] CI lifecycle reconciliation groups durable signals by resource/workflow/branch.
- [x] Latest decisive `failure`/`timed_out`/`startup_failure` keeps one `urgent` condition active.
- [x] `action_required` keeps one `warning` condition active.
- [x] `success` marks the CI series healthy and resolves older derived alerts.
- [x] `cancelled` and unknown/non-conclusive states remain lifecycle-neutral.
- [x] Worker reconciles against durable CI history after signal persistence.
- [x] Auto-resolution only mutates `open`/`acknowledged`; `dismissed` remains a human decision.
- [x] `resolvedAt` uses provider signal `occurredAt` for deterministic event ordering.
- [x] Resolved alerts reopen only when the provider signal is genuinely later than `resolvedAt`.
- [x] Reopen preserves the same alert ID and fingerprint.
- [x] Transactional `alert.auto_resolved` and `alert.reopened` audit events.
- [x] Unit coverage for recovery, newest unhealthy state and lifecycle-neutral cancellation.
- [x] Background smoke expanded to `failure → repeated failure → success → later failure` on workflow `701`.
- [x] ES/EN lifecycle architecture/operations documentation.
- [ ] Final-head nine-gate validation.
- [ ] Merge PR #28 and validate resulting `main`.

**Slice 5f: VALIDATION IN PROGRESS / VALIDACIÓN EN CURSO.**

### Deferred / Diferido

- [ ] Customer-configurable rule editor.
- [ ] Stale PR/issue policy rules.
- [ ] Localized/configurable rule presentation in UI.
- [ ] GitHub App/OAuth authorization and automatic webhook registration after the token-backed adapter boundary is fully proven.

## Security and correctness invariants

1. Workspace/private scope is derived from authenticated/server-controlled context, never raw client tenant/user IDs.
2. Product entitlement and capability checks are server-enforced.
3. MongoDB queries include the applicable scope boundary.
4. Timeline/audit events are server-authored and delivered idempotently through the transactional outbox.
5. Standalone passwords and provider credentials are never persisted in plaintext.
6. Integration administration requires `integrations.manage`.
7. GitHub repository links and connections are workspace-only.
8. Provider credentials never enter durable sync jobs, schedules, signals, alerts or audit events.
9. External IDs, repository names and URLs never grant cross-workspace access.
10. Provider responses are normalized before persistence or client exposure.
11. Durable signal identity is workspace-scoped and idempotent.
12. Sync jobs use server-generated semantic dedupe, claim tokens and bounded leases.
13. Recurring discovery requires same-workspace active validated connection and repository binding.
14. Webhook HMAC secrets are independent from provider credentials and encrypted at rest.
15. Webhook verification uses exact raw bytes before JSON parsing and durable delivery replay protection.
16. Webhook payloads enqueue authoritative provider refresh; they do not become persisted signal truth directly.
17. Derived alert rules consume normalized durable signals and are provider-neutral.
18. Derived alerts are unique by workspace + deterministic fingerprint.
19. `alert.derived` is first-materialization-only.
20. Lifecycle auto-resolution never overrides `dismissed`.
21. A manually resolved alert reopens only for a provider event whose `occurredAt` is later than `resolvedAt`.
22. Resolve/reopen lifecycle changes are transactional with their audit outbox events.

## Next / Siguiente

1. Require all nine checks green on PR #28 final head.
2. Correct any lifecycle or regression failure directly on this slice; do not open another front while a gate is red.
3. Merge PR #28 and validate the resulting `main` commit again.
4. Reassess the remaining Phase 4 boundary from the repository after 5f closes before starting the next isolated slice.
5. Keep customer rule editing, stale PR/issue policies and GitHub App/OAuth separate from this lifecycle slice.
6. When commercial publication is scheduled, create the Kairoseth Software catalog entry as **Gestor de Trabajo / Work Manager**.

## Current blockers / Bloqueos actuales

No known product blocker. PR #28 is in CI validation; the acceptance target is nine green gates including the strengthened background lifecycle smoke.

## Operating rule

Update this file at meaningful milestones. Keep Phase 4 slices small and independently releasable; never mix unrelated provider/auth/rule fronts into a red validation boundary.
