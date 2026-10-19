# 10 — Roadmap / Hoja de ruta

## Phase 0 — Foundation

- Product definition, scope, architecture, portability, tenancy, security, UX and commercial model.
- Status: complete.

## Phase 1 — Core shell

- Portable monorepo.
- Web/API/worker.
- ES/EN baseline.
- Docker and CI baseline.
- Status: complete, merged in PR #1.

## Phase 2 — Identity, tenancy and permissions

- Server-side session context.
- Workspaces and memberships.
- RBAC/capabilities.
- Product entitlements.
- Workspace/private isolation.
- Status: complete, merged in PR #2.

## Phase 3 — Operational core

Completed with persistent standalone multi-user identities, operational domain/UI, transactional audit outbox and a validated standalone release boundary.

Commercial publication names reserved:

- **ES:** Gestor de Trabajo
- **EN:** Work Manager

`Kairoseth Command Center` remains the technical/internal repository/project name. Public product names must not use `Kairoseth` as a prefix.

**Status: complete.**

## Phase 4 — Integrations

Delivered:

- GitHub repository registration and project linking;
- encrypted token-backed connections and live validation/sync;
- normalized repository/PR/issue/CI signals;
- retryable background and recurring refresh;
- verified webhook ingestion and replay protection;
- deterministic derived-alert lifecycle;
- ES/EN setup, maintenance, webhook and activity surfaces.

**Status: complete. Final token-backed GitHub boundary validated on merged `main`.**

Future adapters such as GitLab, Calendar, Gmail/Microsoft 365, Jira/Linear, Slack/Teams and generic webhooks remain separate future roadmap items.

## Phase 5 — Automation and intelligence

Roadmap objectives:

- Configurable rules/automation.
- Cross-source operational signals.
- Explainable prioritization.
- AI assistance only where it improves workflow without becoming required for core correctness.

Delivered through 22 independently releasable slices:

- workspace automation policies and ES/EN administration UI;
- stale-work rules and configurable thresholds;
- deterministic explainable prioritization, delivery risk and configurable weights;
- task dependencies, dependency-aware ranking and start readiness;
- one-time task reminders, worker materialization and ES/EN reminder UI;
- fixed-day task recurrence, ES/EN recurrence UI and exactly-once next-occurrence materialization;
- deterministic task, project and milestone deadline-alert lifecycles;
- transactional audit paths, exact workspace/private isolation and human-authoritative dismissal semantics throughout.

Final runtime boundary: merged `main` commit `d7eb0769bfed765727a851635eca41006ee412c2` completed the full 15-workflow regression set successfully after Slice 22.

See [`47-phase-5-release-boundary.md`](47-phase-5-release-boundary.md) for objective-to-evidence mapping and the explicitly deferred backlog.

**Status: complete. Technical release boundary CLOSED / CERRADA.**

## Phase 6 — Agent Bridge Platform integration / Integración de Agent Bridge en Platform

Purpose: make Kairoseth Platform the authoritative control/observability plane for Agent Bridge without moving runtime authority into the browser or duplicating the Agent Bridge execution core.

Delivered:

- authoritative Mongo-backed A2A task storage for clustered/shared runtimes (`4b2bfa241b8215658081fb11010190c332dfd62f`, PR #50);
- tenant-scoped Agent Bridge observability foundation (`aa0e227baf0b83c42810c6d3f7d367cb0db46b41`, PR #52);
- authoritative control store for enrollment/runtime state;
- enrollment, control-session, heartbeat and authenticated runtime snapshot routes;
- persistent control state and runtime health/connector/tool observability;
- ES/EN operator surface under `/{locale}/ia/agent-bridge`;
- real Agent Bridge control/observability acceptance, including the merged control-observability line in PR #54 (`b444c51bd6f41302d6abbd4d178a940336b23c82`).

Security boundary:

- Platform is control plane; Agent Bridge remains execution/data plane.
- Runtime sessions are authenticated and scoped to tenant + installation + bridge instance.
- Operator observability exposes reduced operational state only; secrets, raw tool inputs/outputs and runtime credentials stay hidden.

**Status: complete for the control/observability foundation required by Phase 7 execution delivery.**

## Phase 7 — Agent Bridge execution and security / Ejecución y seguridad de Agent Bridge

Purpose: let Platform safely govern real Agent Bridge execution while keeping runtime policy, signed approval, audit and trust-chain boundaries explicit and verifiable.

### Phase 7.2A — READ command delivery

Delivered:

- Mongo-backed READ command queue and durable lifecycle;
- runtime-session-bound pull and acknowledgement;
- deterministic action fingerprints;
- real Agent Bridge control-session acceptance (`5006e21516e38c9798a651e8352980c04c01e603`);
- hardening through the actual Agent Bridge `ProductionRuntime` and WooCommerce connector (`3f4b5c48879f09d2c3b83bb5462c432cde78675e`).

**Status: complete.**

### Phase 7.2B — Signed WRITE/CRITICAL execution + audit

Delivered:

- per-workspace Ed25519 approval signer;
- private approval keys encrypted at rest through the existing integration-secret store;
- exact-action signed approval tokens for WRITE/CRITICAL operations;
- explicit operator mutation endpoint with no approval-token exposure in operator projections;
- trusted public-key enrollment bootstrap and runtime key sync;
- durable scope-checked runtime audit ingestion;
- defensive audit secret redaction;
- negative tests for tampering, token injection, TTL and scope failures;
- real acceptance proving WRITE + CRITICAL signature verification, tamper rejection, ACK, key sync, encrypted signer persistence and sanitized audit delivery (`c3ce94a2e6cfde88e5b7676343138cde0288ab09` + hardening `6d348b6ecce118f3e13a045311acec2420c05014`).

**Status: complete.**

### Phase 7 trust-chain rotation

Delivered:

- per-workspace chained approval-key rotation;
- explicit key generations and signed keyset synchronization;
- per-installation generation acknowledgement;
- safe `old -> [old,new] -> [new]` convergence;
- fail-closed handling for runtimes reporting a generation ahead of Platform;
- encrypted old-private-key retirement only after active runtimes converge;
- operator GET/POST API for rotation status/start;
- ProductionRuntime acceptance and the full post-merge workflow set green at `951e8d30f7d8680441123adf8d9a7d974394a596`.

**Status: backend/trust-chain complete.**

### Current Phase 7 slice — rotation operator UI

In progress in PR #70:

- show only safe rotation state in the ES/EN Agent Bridge operator page: generation, phase and trusted-key count;
- never render key IDs, PEM material or tokens;
- require `workspace.manage` to start rotation;
- disable the control while the trust chain is already in `overlap` or `retiring`;
- use a same-origin session-cookie proxy while keeping Platform authorization authoritative;
- add defensive parsing and web tests.

**Status: in progress; merge only after the full repository regression set is green.**

## Commercial product boundary / Límite comercial

The software product is published as:

- **ES:** Gestor de Trabajo
- **EN:** Work Manager
- **Category:** Kairoseth Software
- **Canonical catalog route:** `/products/work-manager`

Commercial publication is already complete. New Agent Bridge capabilities are technical/product evolution and do not reopen Phase 5.

## Operating principles

- Keep phases small and independently releasable.
- Do not open the next major integration/front while the current release boundary is red.
- ES/EN is a product invariant, not a later translation task.
- Portable/self-hosted operation must remain possible without hidden Kairoseth dependencies.
- Authorization and tenant/private boundaries are server-enforced.
- Platform remains control plane; Agent Bridge remains execution/data plane.
- Every security-sensitive lifecycle must have negative tests and an auditable path.
- Approval private keys and connector/runtime secrets must never be exposed through operator UI or durable audit text.
- Deferred backlog is not release-blocking unless a future roadmap explicitly promotes it into scope.
