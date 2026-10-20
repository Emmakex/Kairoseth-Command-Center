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

Commercial publication names reserved and later published:

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

## Product publication / Publicación del producto

- **ES:** Gestor de Trabajo
- **EN:** Work Manager
- **Category:** Kairoseth Software
- Canonical catalog route: `/products/work-manager`.
- Kairoseth Platform PR #507 merged and Hostinger deployment acceptance verified the publication revision.

**Status: complete.**

## Phase 6 — Agent Bridge shared runtime foundation and observability

Objective: make Kairoseth Platform the authoritative shared control/observability plane for Agent Bridge without introducing a parallel runtime channel.

Delivered:

- PR #50 — authoritative MongoDB-backed shared A2A task storage;
- atomic scoped claims and completion binding for clustered/multi-node consumers;
- PR #52 — workspace-bound A2A observability foundation and ES/EN Agent Bridge operator surface;
- PR #54 — one-time workspace enrollment, Ed25519 installation identity, runtime session challenge/open/heartbeat and authenticated runtime snapshots;
- safe connectivity/readiness/version/deployment-mode/connector-health projections;
- runtime tokens stored only as digests and operator sessions forbidden from submitting runtime telemetry.

**Status: complete on the Platform side.**

## Phase 7 — Agent Bridge execution plane and mutation security

Objective: evolve the accepted Agent Bridge control channel from observation into auditable execution while preserving strict runtime, tenant and approval boundaries.

### Phase 7.2A — READ execution

Delivered:

- PR #62 — Mongo-backed READ command queue, scoped runtime pull/ACK, delivery leases and deterministic action fingerprints;
- only tools currently advertised as READ by the selected runtime installation may be queued;
- operator input cannot inject approval tokens;
- PR #64 — ProductionRuntime acceptance executes a real WooCommerce READ through the connector and proves one delivery attempt plus completed ACK.

**Status: complete.**

### Phase 7.2B — Signed WRITE/CRITICAL execution and audit

Delivered:

- PR #65 — per-workspace Ed25519 approval signing identities with private keys encrypted in the integration-secret store;
- short-lived approvals bound to exact tenant, installation, tool, correlation ID and action fingerprint;
- signed WRITE/CRITICAL command delivery without exposing approval tokens to operators;
- durable, scoped, idempotent runtime audit ingestion;
- PR #67 — permanent mutation-security acceptance, tamper rejection, scope negatives and defensive secret redaction.

**Status: complete.**

### Phase 7 security continuation — Approval-key rotation

Delivered:

- chained trust transition `old -> [old,new] -> [new]`;
- per-installation generation acknowledgements and fail-closed future-generation handling;
- signed keyset synchronization over the accepted runtime session;
- encrypted old private-key retirement only after safe convergence;
- workspace-authorized rotation GET/POST routes;
- PR #70 — ES/EN operator controls showing only generation, phase and trusted-key count, merged as `3968f1d768f8e3d06f4a67dfdf1e923c5487e301`.

Post-merge regression for that boundary consists of 18 workflows and must be fully green before the next execution UX slice is merged.

**Status: current Phase 7 delivered boundary merged; post-merge validation active.**

## Next Phase 7 microphase — Operator execution console

The next concrete product gap is no longer backend execution. It is operator UX.

Build an ES/EN Agent Bridge execution console that:

1. selects only an installation/runtime already visible through authenticated runtime observability;
2. lists only currently advertised tools from that runtime snapshot;
3. derives READ / WRITE / CRITICAL risk from authoritative Platform/runtime data rather than browser input;
4. accepts bounded tool arguments through a defensive schema-aware form/projection;
5. routes READ through the existing READ command endpoint;
6. routes WRITE/CRITICAL through the existing signed approval endpoint;
7. never exposes approval tokens, runtime session tokens, key IDs/PEM material or integration secrets;
8. follows queued/delivered/executed/rejected command lifecycle and displays only sanitized result/error projections;
9. requires the existing workspace capability/entitlement checks server-side;
10. includes browser/API negative tests and real ProductionRuntime acceptance before merge.

This microphase must reuse the current command/signing/audit plane. It must not add a second execution mechanism.

## Later roadmap candidates / Candidatos posteriores

These are not blockers for the current delivered boundaries:

- pre-deadline warning windows and configurable deadline severity;
- monthly/calendar/weekday/local-wall-clock recurrence semantics;
- recurring reminder regeneration;
- external notification delivery and snooze/repeat policies;
- dependency graph visualization/drag-and-drop editing;
- automatic dependency-driven task status mutation;
- critical-path/probabilistic forecasting;
- arbitrary executable user rule DSL;
- AI-authored rules or silent priority mutations;
- GitHub App/OAuth and additional work-management providers;
- additional Agent Bridge connector/operator workflows after the execution console proves the generic UX contract.

## Operating principles

- Keep phases small and releasable.
- Do not open the next major front while the current release boundary is red.
- ES/EN is a product invariant, not a later translation task.
- Portable/self-hosted operation must remain possible without hidden Kairoseth dependencies.
- Authorization and tenant/private boundaries are server-enforced.
- Every security-sensitive lifecycle must have negative tests and an auditable path.
- Browser surfaces never become an authority for tenant scope, runtime identity, risk class or approval material.
- Reuse accepted Agent Bridge enrollment/session/snapshot/command/signing/audit contracts; do not create parallel control channels.
- Deferred backlog is not release-blocking unless a future roadmap explicitly promotes it into scope.
