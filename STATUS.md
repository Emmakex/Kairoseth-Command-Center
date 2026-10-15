# Project status / Estado del proyecto

**Current phase:** Phase 4 — GitHub integration closure  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Status:** Phase 3 is closed. Phase 4 Slices 1–5j are merged. Slice 5j passed all nine gates on its final PR head and is merged; post-merge `main` validation is the only remaining closure step for the token-backed GitHub boundary.

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

**Phase 3 technical release boundary: CLOSED / CERRADA.**

## Phase 4 — GitHub integration

### Closed slices / Slices cerradas

- [x] **Slice 1 — normalized repository links (PR #15):** `2c1219f4e0f6b7d568a1c0edb56026c1915ec121`.
- [x] **Slice 2 — encrypted GitHub connections (PR #16):** `79053390c192c3b906847e2dab735ecf91d51531`.
- [x] **Slice 3 — live validation + manual repository sync (PR #17):** `2e9062b373bcef4ffea407eecfe7863c1b5336f4`.
- [x] **Slice 4a — normalized PR/issue/CI signals (PR #18):** `570bc0154fa167a9f3ee84d3dba93bb406757d9b`.
- [x] **Slice 4b — normalized release signals (PR #19):** `4a6619f84c55b67aa211014a46b85062d739fbae`.
- [x] **Slice 4c — durable provider-neutral signal history (PR #20):** `7b38bcf105a766ad39e697e181a634a0321c60ad`.
- [x] **Slice 5a — durable integration sync queue (PR #21):** `5a0b15e31257b42777e7da4d32a79fc33dab0f27`.
- [x] **Slice 5b — credential-backed worker execution (PRs #22–#24):** shared executor `ed1542f1e3402a0d5b3b6a09b740c83df94226ce`.
- [x] **Slice 5c — recurring GitHub refresh (PR #25):** `715f441b8c4a69de3e1b9fd442c241798ec56302`.
- [x] **Slice 5d — verified GitHub webhooks (PR #26):** `e51474854276d6ec73306be8c80f1b7450d583fa`.
- [x] **Slice 5e — provider-neutral derived alerts (PR #27):** `e0b2e8d3454ddbfa1865ddc2031a0ae405220f66`.
- [x] **Slice 5f — derived alert lifecycle (PR #28):** merged `938c5440730ac9a989f02c4da4f944e71788df4b`, post-merge 9/9 green.
- [x] **Slice 5g — Integration activity / Actividad de integraciones (PR #29):** merged `2183aeccc3ff17bc698e35f12d48708a2fbcb56b`, post-merge 9/9 green.
- [x] **Slice 5h — GitHub setup UI / Configuración de GitHub (PR #30):** admin-only create/validate/link/bind/manual-sync UI; merged `b282b17e82ec6347ffd9b20f5a0c55d6f2578274`, post-merge 9/9 green.
- [x] **Slice 5i — GitHub maintenance UI / Mantenimiento de GitHub (PR #31):** token rotation, repository unlink and unused-connection removal; final head `c7f9de7a7cfc5f17b640c1315338b32c1cfe4dac`, merged `9f3f256690e7ea4cad63e26406886bdcdcaacefa`, post-merge 9/9 green.
- [x] **Slice 5j — GitHub webhook administration UI / Administración de webhook GitHub (PR #32):** safe state lookup, provision/rotate/delete controls, ES/EN manual setup guidance and session-bound one-time HMAC secret reveal; final head `71d80ce89d0f654b83c90d1f7827f0af4e0b7431` validated 9/9, merged `1aeee36a7049afc03f02069297dfac01fa954f4a`.

### Phase 4 boundary / Frontera de Fase 4

The token-backed GitHub integration is functionally complete for the current product boundary:

- [x] encrypted connection lifecycle;
- [x] repository linking and manual sync;
- [x] durable normalized PR/issue/CI/release signals;
- [x] durable queue, worker, retries and recurring reconciliation;
- [x] verified webhooks with HMAC/replay protection;
- [x] provider-neutral derived alerts with resolve/reopen lifecycle;
- [x] workspace integration activity UI;
- [x] admin connection/repository maintenance UI;
- [x] manual webhook provisioning/rotation/removal UI with one-time secret handling;
- [ ] final post-merge `main` 9/9 validation for the closure commit.

**Phase 4 token-backed boundary: CLOSURE VALIDATION / VALIDACIÓN DE CIERRE.**

### Deferred enhancements / Mejoras diferidas

- [ ] GitHub App/OAuth authorization and automatic webhook registration/removal.
- [ ] Additional integration providers.

These are enhancements/new adapter fronts, not blockers for the current token-backed GitHub product boundary.

## Phase 5 candidates / Candidatos de Fase 5

- [ ] Customer-configurable rules/automation.
- [ ] Stale PR/issue policy rules built on normalized durable signals.
- [ ] Cross-source operational signals when a second provider is intentionally opened.
- [ ] Explainable prioritization and AI assistance only where core correctness remains deterministic.

No Phase 5 implementation front opens until the Phase 4 closure `main` commit is 9/9 green.

## Security and correctness invariants

1. Workspace/private scope is server-derived from authenticated context.
2. Product entitlement and capability checks are server-enforced.
3. Integration administration requires `integrations.manage`.
4. GitHub repository links, connections and webhook management are workspace-only.
5. Standalone passwords and provider credentials are never persisted in plaintext.
6. Provider credentials never enter durable jobs, schedules, signals, alerts or audit events.
7. Provider responses are normalized before persistence or client exposure.
8. Webhook HMAC secrets are independent from provider credentials and encrypted at rest.
9. Exact webhook raw bytes are verified with HMAC-SHA256 before JSON parsing and deliveries are replay-protected.
10. Derived alert rules consume normalized durable signals and remain provider-neutral.
11. Integration activity is workspace-only/read-only and never exposes credentials or internal provider/resource/workspace IDs.
12. GitHub setup/maintenance/webhook administration is not loaded in private scope.
13. Provider tokens are write-only at the web boundary and are submitted only in request bodies.
14. The API remains authoritative for tenancy, capabilities, provider validation and deletion safety.
15. Connection/resource identifiers are URL-encoded before entering API paths.
16. Repository unlink removes only the local Work Manager link; it does not delete the remote GitHub repository.
17. Connection removal remains blocked while normalized resources reference that connection.
18. Webhook HMAC secrets never enter URL/query state or normal dashboard HTML.
19. One-time webhook secret reveal is session-bound, authenticated, short-lived, tamper-evident and consumed by clearing its HttpOnly cookie.
20. The web UI never derives a public webhook host from an internal API URL; deployment-specific public HTTPS host configuration remains explicit until automatic registration exists.

## Next / Siguiente

1. Require all nine workflows green on the current `main` closure commit.
2. If any gate fails, correct that regression before opening Phase 5.
3. Once 9/9 green, mark the Phase 4 token-backed GitHub boundary closed and start the first isolated Phase 5 automation/rules slice from that exact green commit.
4. Keep GitHub App/OAuth and additional providers separate from Phase 5 rule logic.
5. When commercial publication is scheduled, create the Kairoseth Software catalog entry as **Gestor de Trabajo / Work Manager**.

## Current blockers / Bloqueos actuales

No known product blocker. Only final post-merge regression validation remains for the Phase 4 closure boundary.

## Operating rule

Update this file at meaningful milestones. Keep slices small and independently releasable; never mix unrelated provider/auth/rule fronts into a red validation boundary.
