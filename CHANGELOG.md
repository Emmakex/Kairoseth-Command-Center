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

### Security
- Upgraded Vitest to a patched release after CI detected critical `tinypool` advisories.
- Private user data remains inaccessible to workspace administrators unless the user is the owner of that private scope.
- Role selection in the UI is explicitly non-authoritative; permissions are resolved server-side.
- Provider credentials remain encrypted and outside durable automation/reminder/recurrence/deadline payloads.
- Core automation and prioritization correctness remains deterministic and AI-independent.

### Status
Phases 0–5 are technically complete. Phase 5 runtime closure is anchored at merged `main` commit `d7eb0769bfed765727a851635eca41006ee412c2`, validated with the complete 15-workflow regression set after Slice 22. The next product-level work is release/commercial packaging and Kairoseth Software catalog publication as **Gestor de Trabajo** (ES) / **Work Manager** (EN).
