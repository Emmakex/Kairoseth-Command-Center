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

### Security
- Upgraded Vitest to a patched release after CI detected critical `tinypool` advisories.
- Private user data remains inaccessible to workspace administrators unless the user is the owner of that private scope.
- Role selection in the UI is explicitly non-authoritative; permissions are resolved server-side.

### Status
Phase 1 is merged and validated. Phase 2 identity/workspace/authorization core is implemented on `feat/phase-2-identity-workspaces` and awaiting its PR quality gate.
