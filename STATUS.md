# Project status / Estado del proyecto

**Current phase:** Phase 4 — GitHub integration  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Status:** Phase 3 is closed. Phase 4 Slices 1–5g are merged and post-merge validated. Slice 5h — GitHub setup UI / Configuración de GitHub — is active in PR #30.

## Naming rule / Regla de naming

- **ES:** Gestor de Trabajo
- **EN:** Work Manager
- `Kairoseth Command Center` remains the technical/internal repository name.
- Public product names do **not** use `Kairoseth` as a prefix; Kairoseth is the vendor/catalog brand.
- ES and EN commercial names/descriptors are defined independently.

## Completed / Completado

### Phases 0–3

- [x] Product, architecture, portability, tenancy, security and commercial model documented.
- [x] Portable monorepo with web/API/worker, ES/EN, Docker and CI baseline.
- [x] Server-side identity, workspaces, memberships, RBAC/capabilities and product entitlements.
- [x] Strict workspace/private isolation.
- [x] Projects, Tasks, Alerts, Decisions, Timeline, Quick Capture and Milestones.
- [x] Standalone persistent multi-user authentication and password lifecycle.
- [x] Transactional audit outbox, production-oriented standalone profile, backup and guarded restore.
- [x] Phase 3 release boundary closed and post-merge validated.

**Phase 3 technical release boundary: CLOSED / CERRADA.**

## Phase 4 — GitHub integration

### Closed slices / Slices cerradas

- [x] **Slice 1 — normalized repository links (PR #15):** merged as `2c1219f4e0f6b7d568a1c0edb56026c1915ec121`.
- [x] **Slice 2 — encrypted GitHub connections (PR #16):** AES-256-GCM credential vault; merged as `79053390c192c3b906847e2dab735ecf91d51531`.
- [x] **Slice 3 — live validation + manual repository sync (PR #17):** trusted provider adapter and live sync; merged as `2e9062b373bcef4ffea407eecfe7863c1b5336f4`.
- [x] **Slice 4a — normalized PR/issue/CI signals (PR #18):** merged as `570bc0154fa167a9f3ee84d3dba93bb406757d9b`.
- [x] **Slice 4b — normalized release signals (PR #19):** merged as `4a6619f84c55b67aa211014a46b85062d739fbae`.
- [x] **Slice 4c — durable provider-neutral signal history (PR #20):** merged as `7b38bcf105a766ad39e697e181a634a0321c60ad`.
- [x] **Slice 5a — durable integration sync queue (PR #21):** dedupe, leases, retry/dead-letter; merged as `5a0b15e31257b42777e7da4d32a79fc33dab0f27`.
- [x] **Slice 5b — credential-backed worker execution (PRs #22–#24):** shared worker executor merged as `ed1542f1e3402a0d5b3b6a09b740c83df94226ce`.
- [x] **Slice 5c — recurring GitHub refresh (PR #25):** merged as `715f441b8c4a69de3e1b9fd442c241798ec56302`.
- [x] **Slice 5d — verified GitHub webhooks (PR #26):** HMAC verification, replay protection and refresh enqueue; merged as `e51474854276d6ec73306be8c80f1b7450d583fa`.
- [x] **Slice 5e — provider-neutral derived alerts (PR #27):** deterministic fingerprints and first-materialization audit; merged as `e0b2e8d3454ddbfa1865ddc2031a0ae405220f66`.
- [x] **Slice 5f — derived alert lifecycle (PR #28):** automatic resolve/reopen from durable CI history; final head `7a7074df80f88663707bce8986d31a22110b53e5`, merged as `938c5440730ac9a989f02c4da4f944e71788df4b`, post-merge 9/9 green.
- [x] **Slice 5g — Integration activity / Actividad de integraciones (PR #29):** workspace-only provider-neutral activity surface, ES/EN, safe external links and private-scope isolation; final head `7dcefddc5dbbb6011951a33a66a8f14d6fdf95bc`, merged as `2183aeccc3ff17bc698e35f12d48708a2fbcb56b`, post-merge 9/9 green.

## Active / Activo

### Slice 5h — GitHub setup UI / Configuración de GitHub (PR #30)

Implemented on the active draft PR:

- [x] Workspace-only GitHub setup surface guarded by `integrations.manage`.
- [x] Server-side reads for redacted GitHub connections and linked repositories.
- [x] Create a GitHub connection from the product using a write-only provider token.
- [x] Validate a connection through the trusted GitHub provider adapter.
- [x] Link a GitHub repository to an existing Work Manager project.
- [x] Bind a repository to an active validated connection.
- [x] Trigger the existing manual repository sync from the product UI.
- [x] Server-side `/api/integrations/github` mutation route using the authenticated session cookie.
- [x] Strict mutation parser with provider-coordinate validation and URL-encoded identifiers.
- [x] ES/EN responsive setup UI.
- [x] Provider token is never rendered after submission and is never placed in a URL.
- [x] Missing project references use neutral UI copy rather than exposing internal project IDs.
- [x] Private scope does not request or render GitHub administration data.
- [x] Users without `integrations.manage` do not trigger GitHub administration reads.
- [x] Unit coverage for setup mutation parsing and unsafe-input rejection.
- [x] GitHub live-sync Docker workflow extended with web-surface acceptance: create/validate connection, bind/sync repository, ES/EN rendering, token non-leakage and private-scope non-leakage.
- [x] Architecture/operations documentation in `docs/22-github-setup-ui.md`.
- [ ] Final-head nine-gate validation.
- [ ] Merge PR #30 and validate resulting `main`.

**Slice 5h: VALIDATION IN PROGRESS / VALIDACIÓN EN CURSO.**

### Deferred / Diferido

- [ ] Provider-token rotation UI.
- [ ] Connection disconnect/delete UI.
- [ ] Webhook endpoint provisioning/rotation UI.
- [ ] GitHub App/OAuth authorization and automatic webhook registration.
- [ ] Customer-configurable rule editor.
- [ ] Stale PR/issue policy rules.

## Security and correctness invariants

1. Workspace/private scope is derived from authenticated/server-controlled context, never raw client tenant/user IDs.
2. Product entitlement and capability checks are server-enforced.
3. MongoDB queries include the applicable scope boundary.
4. Timeline/audit events are server-authored and delivered idempotently through the transactional outbox.
5. Standalone passwords and provider credentials are never persisted in plaintext.
6. Integration administration requires `integrations.manage`.
7. GitHub repository links and connections are workspace-only.
8. Provider credentials never enter durable jobs, schedules, signals, alerts or audit events.
9. Provider responses are normalized before persistence or client exposure.
10. Sync jobs use server-generated dedupe, claim tokens, bounded leases and bounded retries.
11. Webhook HMAC secrets are independent from provider credentials, encrypted at rest and verified against exact raw bytes.
12. Webhook payloads enqueue authoritative provider refresh; they do not become persisted signal truth directly.
13. Derived alert rules consume normalized durable signals and are provider-neutral.
14. Derived alerts are unique by workspace + deterministic fingerprint; first materialization emits `alert.derived` only once.
15. Lifecycle auto-resolution never overrides `dismissed`; reopen requires a genuinely later provider event.
16. Integration activity is workspace-only/read-only and never exposes credentials or internal provider/resource/workspace IDs.
17. Integration activity external links are limited to validated `http`/`https` normalized URLs.
18. GitHub setup is workspace-only, requires `integrations.manage`, and is not loaded in private scope.
19. Provider tokens are write-only at the web boundary and are submitted only in request bodies.
20. The web mutation route never becomes an authorization boundary; the API remains authoritative for tenancy, capability and provider validation.
21. Connection/resource identifiers are URL-encoded before being inserted into API paths.

## Next / Siguiente

1. Require all nine checks green on the final PR #30 head, including the strengthened GitHub live-sync UI acceptance.
2. Correct any setup, credential-leakage, isolation or regression failure directly on Slice 5h; do not open another front while a gate is red.
3. Mark PR #30 ready, merge it with the exact validated head and revalidate the resulting `main` commit.
4. Reassess the remaining Phase 4 boundary from the repository after 5h closes.
5. Keep token rotation/deletion, webhook administration, GitHub App/OAuth, configurable rules and stale policies as separate slices.
6. When commercial publication is scheduled, create the Kairoseth Software catalog entry as **Gestor de Trabajo / Work Manager**.

## Current blockers / Bloqueos actuales

No known product blocker. PR #30 is in CI validation. Acceptance requires nine green gates and explicit proof that the web setup flow never leaks provider credentials or workspace administration into private scope.

## Operating rule

Update this file at meaningful milestones. Keep Phase 4 slices small and independently releasable; never mix unrelated provider/auth/rule fronts into a red validation boundary.
