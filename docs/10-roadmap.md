# 10 — Roadmap / Hoja de ruta

## Phase 0 — Foundation

Goal: freeze product boundaries before implementation.

Deliverables:
- product definition;
- MVP scope;
- portable architecture;
- tenant/RBAC model;
- deployment model;
- domain entities;
- security baseline;
- ES/EN requirement;
- initial repository documentation.

**Exit gate:** documentation approved and no unresolved architectural blocker.

## Phase 1 — Core shell

Deliverables:
- monorepo/workspace structure;
- web + API skeleton;
- configuration system;
- i18n ES/EN;
- standalone local development environment;
- health endpoints;
- base CI.

**Exit gate:** clean build/test, local environment reproducible.

## Phase 2 — Identity, workspaces and permissions

Deliverables:
- user/session context;
- workspace membership;
- role/capability authorization;
- private vs workspace scope;
- local auth adapter;
- Kairoseth Identity adapter contract.

**Exit gate:** cross-tenant negative tests and private-scope tests pass.

## Phase 3 — Operational core

Deliverables:
- Projects;
- Milestones;
- Tasks;
- Alerts;
- Timeline;
- Decisions;
- Personal/private reminders;
- Today dashboard;
- quick capture without AI dependency.

**Exit gate:** product is useful manually with no external integration.

## Phase 4 — GitHub integration

Deliverables:
- repository connection;
- project/repository mapping;
- commits/PR/issues/CI/release signals;
- webhook ingestion;
- sync worker;
- integration health;
- alert generation/deduplication.

**Exit gate:** a real project can be monitored end-to-end from GitHub.

## Phase 5 — Intelligent prioritization

Deliverables:
- rule-based priority score;
- explainable “what to do next”;
- natural-language capture assistance;
- daily summary;
- related-alert grouping.

**Exit gate:** every suggestion exposes its reasoning/source and remains user-overridable.

## Phase 6 — Kairoseth product integration

Deliverables:
- Kairoseth Platform host adapter;
- Kairoseth Identity integration;
- product entitlement integration;
- Kairoseth products as project/signal sources;
- optional default landing experience for authorized Kairoseth internal users.

**Exit gate:** Command Center runs inside Kairoseth without compromising standalone portability.

## Phase 7 — External productivity connectors

Planned order:
- GitLab;
- Google/Microsoft Calendar;
- Gmail/Microsoft 365 metadata/actionable follow-ups;
- Jira/Linear;
- Slack/Teams;
- generic webhooks.

## Phase 8 — Private/self-hosted release

Deliverables:
- production Docker deployment;
- setup wizard/configuration guide;
- backup/restore;
- upgrade/migration tooling;
- OIDC;
- observability package;
- security hardening;
- release artifacts/checksums.

## Phase 9 — Enterprise

Potential deliverables:
- SAML;
- SCIM;
- enterprise audit/export;
- policy controls;
- embedded API/SDK;
- HA/Kubernetes deployment templates;
- advanced data residency controls.

## Roadmap rule

Do not skip portability, tenancy or authorization foundations to accelerate UI delivery. These are product capabilities, not infrastructure details.
