# Changelog

All notable product releases will be documented here.

This project follows semantic versioning once versioned releases begin.

## Unreleased

### Added
- Initial product definition and positioning.
- Portable product architecture.
- MVP functional scope.
- Domain/data model.
- Authentication, multi-tenancy and RBAC model.
- Cloud / Private Cloud / Self-Hosted deployment strategy.
- GitHub-first integration architecture.
- API and normalized event conventions.
- Security/privacy baseline.
- UX/information architecture.
- Roadmap and release gates.
- Operations/observability baseline.
- Commercial packaging.
- Initial decision log.
- Contribution and security documentation.
- pnpm monorepo with `web`, `api` and `worker` applications.
- Shared `domain`, `contracts`, `auth`, `integrations`, `config` and `ui` packages.
- ES/EN web shell with `/es` and `/en` routes.
- Fastify `/health` and `/ready` endpoints with MongoDB readiness.
- Background worker bootstrap and MongoDB heartbeat.
- Docker Compose local stack and service Dockerfiles.
- Base GitHub Actions CI with lint, typecheck, tests, build, dependency audit, secret scan and Docker smoke validation.
- `User`, `Workspace` and `Membership` domain entities.
- Capability-based authorization with owner/admin/member presets and Kairoseth-only `platform_admin`.
- Product entitlement checks.
- Strict workspace/private scope authorization.
- Portable Local and Kairoseth Identity auth provider contracts.
- Protected `GET /v1/session` endpoint with server-side session resolution.
- Cross-tenant, private-scope, membership-state and invalid-session negative tests.
- Local development guide.
- Complete operational core with projects, tasks, alerts, decisions, timeline, milestones, persistent local identities and transactional audit outbox.
- GitHub integration with encrypted connections, normalized signals, background/recurring refresh, verified webhooks and derived-alert lifecycle.
- Phase 5 deterministic automation policies, stale-work rules, explainable prioritization, configurable weights and dependency-aware readiness.
- One-time task reminders, fixed-day task recurrence and exactly-once recurrence materialization.
- Deterministic overdue task, project and milestone alert lifecycles with exact-scope deduplication, auto-resolution, reopening and human-authoritative dismissal.
- Formal Phase 5 technical release boundary with a 15-workflow merged-main regression gate and explicit future backlog.
- Phase 6 Agent Bridge foundation/control plane with durable A2A state, authenticated runtime enrollment/sessions, runtime snapshots, workspace-scoped observability and safe operator control projections.
- Phase 7 governed Agent Bridge execution with real READ delivery, signed WRITE/CRITICAL approvals, mutation security, runtime audit coverage and chained approval-key rotation.
- Safe workspace/installation-scoped Agent Bridge tool inventory and governed ES/EN operator execution console.
- Safe operator command projection with runtime/correlation identity removal and secret-bearing acknowledgement sanitization.
- Bounded tenant + installation scoped execution history API and ES/EN paginated history UI, delivered in PRs #78 and #79.
- Formal Phase 7 technical release boundary anchored at merged `main` `39871f5ef662b8b5b44d14ac3a3363a48eabd4f3` with the complete 18-workflow post-merge regression green.
- Kairoseth Software catalog publication for **Gestor de Trabajo** (ES) / **Work Manager** (EN) under canonical route `/products/work-manager`, with production deployment confirmed.

### Security
- Upgraded Vitest to a patched release after CI detected critical `tinypool` advisories.
- Private user data remains inaccessible to workspace administrators unless the user is the owner of that private scope.
- Role selection in the UI is explicitly non-authoritative; permissions are resolved server-side.
- Provider credentials remain encrypted and outside durable automation/reminder/recurrence/deadline payloads.
- Core automation and prioritization correctness remains deterministic and AI-independent.
- Agent Bridge tenant, runtime identity, risk classification and approval policy remain server-authoritative.
- WRITE/CRITICAL execution requires signed server-side approval; approval tokens, key material, runtime sessions and connector credentials are not operator-renderable.
- Command and history projections exclude runtime session/correlation identity and sanitize secret-bearing acknowledgement output before leaving the API.
- Execution-history reads are bounded and scoped by authoritative tenant + installation, with web-layer cross-installation rejection as defense in depth.

### Status
Phases 0–7 are technically complete. Phase 7 runtime closure is anchored at merged `main` commit `39871f5ef662b8b5b44d14ac3a3363a48eabd4f3`, validated with the complete 18-workflow post-merge regression set after PR #79. Commercial publication as **Gestor de Trabajo** (ES) / **Work Manager** (EN) is complete. No Phase 8 scope is declared; future work, including Agent Bridge retry/cancel, must be promoted explicitly with its own lifecycle, security and acceptance contract.
