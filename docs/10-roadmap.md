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

## Phase 6 — Agent Bridge platform foundation and control plane

Delivered:

- shared durable A2A task/state storage;
- authenticated runtime enrollment and short-lived runtime sessions;
- session-bound heartbeat and authenticated runtime snapshots;
- workspace-scoped runtime observability;
- reduced connector/tool health projections that do not expose runtime credentials or session material;
- operator-facing control/observability surfaces with server-enforced workspace authorization.

The phase established Platform as the authority for tenant scope, runtime identity and observable connector/tool state. Browser clients are not trusted as a source of runtime or tenant authority.

**Status: complete. Foundation/control boundary CLOSED / CERRADA.**

## Phase 7 — Governed Agent Bridge execution and security

Delivered slices:

- READ command delivery through the shared execution store and real `ProductionRuntime` acceptance;
- server-side signed approval flow for WRITE/CRITICAL tools using Ed25519 approval material;
- mutation security hardening, runtime audit coverage and negative acceptance paths;
- chained approval-key rotation with safe overlap/retirement and ES/EN operator controls;
- safe workspace/installation-scoped tool inventory exposing only executable identity, copy, risk, availability and reduced connector identity;
- governed ES/EN execution console merged in PR #75 as `8101a76d126026bc2b4a1c0eb46810cf1e4f47b5`;
- server-side derivation of READ versus signed mutation execution from authoritative inventory; the browser cannot choose risk, approval tokens or execution endpoints;
- safe operator command projection that removes runtime session identity and redacts secret-bearing ACK reason/output before it leaves the API;
- second defensive sanitization layer in the web surface;
- real acceptance covering inventory → queue → `ProductionRuntime` → ACK for both READ and signed mutation execution.

Infrastructure maintenance after the console merge:

- PR #76 preserved `mongo:8.0` as the standalone/product default while allowing the GitHub-hosted standalone smoke to use the compatible `mongo:7.0.43` image;
- merged `main` `f3a3726ed018b0425aefd06bfd72d4c9a1e75bfb` completed the full 18-workflow post-merge regression with no failed, queued or in-progress workflow remaining.

### Next Phase 7 microphase

**Safe paginated execution history per workspace/installation.**

Scope:

- add bounded `listCommands` persistence/query semantics scoped by authoritative tenant + installation;
- expose an operator API that returns only the existing safe command projection;
- add an execution-history panel to the Agent Bridge console;
- use bounded cursor/limit pagination rather than unbounded command reads;
- acceptance must prove that runtime session IDs, correlation IDs, approval material, action fingerprints, key material, credentials and secret-bearing connector output cannot leak through the history surface.

Retry/cancel semantics are intentionally **not** part of this microphase unless a separate contract promotes them later.

**Status: ACTIVE / ACTIVA.**

## Commercial publication boundary

The initial Kairoseth Software catalog publication remains complete:

- **ES:** Gestor de Trabajo
- **EN:** Work Manager
- **Category:** Kairoseth Software
- **Canonical route:** `/products/work-manager`

Public pricing remains deferred until the Cloud / Private Cloud / Self-Hosted resource and operating-cost profile is measured.

## Operating principles

- Keep phases small and releasable.
- Do not open the next major integration/front while the current release boundary is red.
- ES/EN is a product invariant, not a later translation task.
- Portable/self-hosted operation must remain possible without hidden Kairoseth dependencies.
- Authorization and tenant/private boundaries are server-enforced.
- Every security-sensitive lifecycle must have negative tests and an auditable path.
- Agent Bridge browser surfaces never become tenant, runtime-risk or approval authorities.
- Runtime/session/key/approval secrets must be removed or redacted before operator API responses, with UI sanitization as defense in depth rather than the primary boundary.
- Deferred backlog is not release-blocking unless a future roadmap explicitly promotes it into scope.
