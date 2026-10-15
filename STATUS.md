# Project status / Estado del proyecto

**Current phase:** Phase 4 — GitHub integration  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Status:** Phase 3 is closed. Phase 4 Slices 1–5h are merged and post-merge validated. Slice 5i — GitHub maintenance UI / Mantenimiento de GitHub — is active.

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
- [x] **Slice 5h — GitHub setup UI / Configuración de GitHub (PR #30):** admin-only create/validate/link/bind/manual-sync UI, write-only provider token, ES/EN, private-scope isolation; final head `1464ad6c281bf6c6643e68ef8e7eb0b52001717c`, merged `b282b17e82ec6347ffd9b20f5a0c55d6f2578274`, post-merge 9/9 green.

## Active / Activo

### Slice 5i — GitHub maintenance UI / Mantenimiento de GitHub

Implemented on `feat/phase-4-github-maintenance-ui`:

- [x] Provider-token rotation mutation through the existing server-side GitHub route.
- [x] Rotated tokens remain write-only and never enter URLs.
- [x] Repository unlink mutation reuses the existing workspace/capability-protected API.
- [x] Unused-connection deletion mutation reuses backend `github_connection_in_use` protection.
- [x] Destructive web mutations require explicit intended-action confirmation values.
- [x] Connection/resource identifiers remain URL-encoded.
- [x] UI disables connection removal while a loaded repository still references it.
- [x] ES/EN maintenance controls for rotate token, unlink repository and remove connection.
- [x] Unit coverage for rotation, destructive confirmation and malformed-input rejection.
- [x] Existing GitHub connections Docker smoke remains the real encrypted-rotation/deletion acceptance path.
- [x] Documentation in `docs/23-github-maintenance-ui.md`.
- [ ] Final-head nine-gate validation.
- [ ] Merge and post-merge `main` validation.

**Slice 5i: VALIDATION PENDING / VALIDACIÓN PENDIENTE.**

### Deferred / Diferido

- [ ] Webhook endpoint provisioning/rotation/deletion UI.
- [ ] GitHub App/OAuth authorization and automatic webhook registration.
- [ ] Customer-configurable rule editor.
- [ ] Stale PR/issue policy rules.

## Security and correctness invariants

1. Workspace/private scope is server-derived from authenticated context.
2. Product entitlement and capability checks are server-enforced.
3. Integration administration requires `integrations.manage`.
4. GitHub repository links and connections are workspace-only.
5. Standalone passwords and provider credentials are never persisted in plaintext.
6. Provider credentials never enter durable jobs, schedules, signals, alerts or audit events.
7. Provider responses are normalized before persistence or client exposure.
8. Webhook HMAC secrets are independent from provider credentials and encrypted at rest.
9. Derived alert rules consume normalized durable signals and remain provider-neutral.
10. Integration activity is workspace-only/read-only and never exposes credentials or internal provider/resource/workspace IDs.
11. GitHub setup/maintenance is workspace-only and is not loaded in private scope.
12. Provider tokens are write-only at the web boundary and are submitted only in request bodies.
13. The API remains authoritative for tenancy, capabilities, provider validation and deletion safety.
14. Connection/resource identifiers are URL-encoded before entering API paths.
15. Repository unlink removes only the local Work Manager link; it does not delete the remote GitHub repository.
16. Connection removal remains blocked while normalized resources reference that connection.

## Next / Siguiente

1. Open the isolated Slice 5i PR and require all nine checks green on its final head.
2. Correct any maintenance/security/regression failure directly on 5i.
3. Merge with the exact validated head and revalidate resulting `main` 9/9.
4. Reassess the remaining Phase 4 boundary before deciding between webhook administration UI and closing Phase 4 toward Phase 5.
5. Keep GitHub App/OAuth, configurable rules and stale policies separate.
6. When commercial publication is scheduled, create the Kairoseth Software catalog entry as **Gestor de Trabajo / Work Manager**.

## Current blockers / Bloqueos actuales

No known product blocker. Slice 5i is ready for PR validation.

## Operating rule

Update this file at meaningful milestones. Keep slices small and independently releasable; never mix unrelated provider/auth/rule fronts into a red validation boundary.
