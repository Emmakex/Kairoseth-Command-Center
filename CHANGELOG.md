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
- Base GitHub Actions CI with lint, typecheck, tests, build, dependency audit and secret scan.
- Local development guide.

### Status
Phase 1 implementation is in progress. The core shell has been scaffolded on `feat/phase-1-core-shell`; CI validation is required before the Phase 1 exit gate can be considered complete.
