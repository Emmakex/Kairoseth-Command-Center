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
- Commercial Kairoseth Software publication as **Gestor de Trabajo** (ES) / **Work Manager** (EN) at `/products/work-manager`.
- Phase 6 authoritative Agent Bridge A2A shared storage, enrollment/control-session state, heartbeat/snapshot ingestion and ES/EN runtime observability.
- Phase 7.2A durable READ command delivery with runtime pull/ACK, deterministic fingerprints and real `ProductionRuntime` acceptance.
- Phase 7.2B per-workspace Ed25519 signed WRITE/CRITICAL approvals, encrypted private-key storage, trusted-key sync and durable runtime audit ingestion.
- Chained approval-key rotation with signed generations, active-runtime convergence and encrypted old-key retirement.
- Operator GET/POST APIs for approval-key rotation; the ES/EN rotation control surface is the current Phase 7 UI slice.

### Security
- Upgraded Vitest to a patched release after CI detected critical `tinypool` advisories.
- Private user data remains inaccessible to workspace administrators unless the user is the owner of that private scope.
- Role selection in the UI is explicitly non-authoritative; permissions are resolved server-side.
- Provider credentials remain encrypted and outside durable automation/reminder/recurrence/deadline payloads.
- Core automation and prioritization correctness remains deterministic and AI-independent.
- Agent Bridge runtime sessions are scoped to tenant + installation + bridge instance and use short-lived opaque credentials whose digests are stored server-side.
- WRITE/CRITICAL delivery requires exact-action signed approval tokens; operator projections never expose approval tokens.
- Approval private keys are encrypted at rest per workspace through the existing integration-secret store.
- Runtime audit messages are defensively redacted before durable persistence.
- Approval-key rotation uses signed keyset generations and retires old private keys only after active runtime convergence.
- Real Agent Bridge negative/acceptance coverage includes tamper rejection, scope checks, token-injection rejection and key-sync boundaries.

### Status
Phases 0–5 are technically complete and the commercial Work Manager publication is deployed. Phase 6 Agent Bridge control/observability is complete. Phase 7.2A READ delivery, Phase 7.2B signed WRITE/CRITICAL execution + runtime audit, and the chained approval-key-rotation backend are complete. The current Phase 7 work is the bounded ES/EN operator rotation surface in PR #70, which remains merge-gated by the full repository regression set.
