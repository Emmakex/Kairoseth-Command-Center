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

### Completed slices

- Projects, Tasks, Alerts, Decisions and Timeline domain/API foundation.
- Scoped MongoDB persistence.
- Quick Capture and operational mutations.
- Weighted Milestones and automatic project progress.
- Standalone login/bootstrap and authenticated Today dashboard.
- ES/EN operational UI for Quick Capture, Projects, Tasks and Alerts.
- Milestone management and Decision Log UI.
- Scoped Timeline/audit UI.
- Validated Decision create/supersede/reverse lifecycle.
- Transactional audit outbox foundation and worker delivery.
- Transactional migration of all current manual operational mutation families.
- PR #12 merged; post-merge main CI #64 green.

### Current final functional slice — PR #13

Persistent standalone multi-user identities:

- Mongo-backed users/workspaces/memberships/local credentials;
- `scrypt-v1` password derivation with random salt;
- persisted owner bootstrap and restart-safe local auth;
- `owner` / `admin` / `member` capability resolution;
- protected member management and owner invariants;
- password change/reset with immediate old-session invalidation;
- identity/password lifecycle audit through the transactional outbox;
- ES/EN account and member-management UI;
- route-level authorization/owner-protection tests;
- dedicated Docker multi-user lifecycle smoke and GitHub Actions gate.

Phase 3 closes only after PR #13 and its dedicated smoke are green on the final head, merged, and post-merge `main` verification is green.

## Phase 3 release boundary

After PR #13:

1. run one final standalone end-to-end release gate across merged `main`;
2. verify deployment/backup/configuration documentation is sufficient for a customer installation;
3. prepare the product for Kairoseth Software publication.

Commercial publication names are already reserved:

- **ES:** Gestor de Trabajo
- **EN:** Work Manager

`Kairoseth Command Center` remains the technical/internal repository/project name. Public product names must not use `Kairoseth` as a prefix.

## Phase 4 — Integrations

Begin only after the standalone Phase 3 release boundary is clean.

Initial priority:

- GitHub integration;
- repository/PR/issue status ingestion;
- project ↔ repository linking;
- alerts and Timeline signals derived from GitHub without replacing GitHub itself.

Future adapters may include additional project, calendar, communication and enterprise systems.

## Phase 5 — Automation and intelligence

- Configurable rules/automation.
- Cross-source operational signals.
- Explainable prioritization.
- AI assistance only where it improves workflow without becoming required for core correctness.

## Operating principles

- Keep phases small and releasable.
- Do not open the next major integration front while the current release boundary is red.
- ES/EN is a product invariant, not a later translation task.
- Portable/self-hosted operation must remain possible without hidden Kairoseth dependencies.
- Authorization and tenant/private boundaries are server-enforced.
- Every security-sensitive lifecycle must have negative tests and an auditable path.
