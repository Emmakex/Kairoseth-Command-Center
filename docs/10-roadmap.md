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

## After Phase 5 / Después de Fase 5

The next product-level work is release/commercial packaging and catalog publication of:

- **ES:** Gestor de Trabajo
- **EN:** Work Manager
- **Category:** Kairoseth Software

Do not silently extend Phase 5 with deferred features. New capabilities require an explicitly documented future phase or maintenance slice with their own product, security and acceptance contracts.

## Operating principles

- Keep phases small and releasable.
- Do not open the next major integration/front while the current release boundary is red.
- ES/EN is a product invariant, not a later translation task.
- Portable/self-hosted operation must remain possible without hidden Kairoseth dependencies.
- Authorization and tenant/private boundaries are server-enforced.
- Every security-sensitive lifecycle must have negative tests and an auditable path.
- Deferred backlog is not release-blocking unless a future roadmap explicitly promotes it into scope.
