# Documentation map / Mapa de documentación

This folder is the source of truth for product, architecture and delivery decisions.  
Esta carpeta es la fuente de verdad para las decisiones de producto, arquitectura y entrega.

## Documents / Documentos

1. [`00-product-definition.md`](00-product-definition.md) — vision, positioning, product boundaries.
2. [`01-functional-scope.md`](01-functional-scope.md) — modules, MVP and out-of-scope.
3. [`02-system-architecture.md`](02-system-architecture.md) — portable architecture and component boundaries.
4. [`03-domain-data-model.md`](03-domain-data-model.md) — workspaces, projects, tasks, alerts, decisions, events.
5. [`04-auth-tenancy-rbac.md`](04-auth-tenancy-rbac.md) — authentication adapters, tenancy and permissions.
6. [`05-deployment-portability.md`](05-deployment-portability.md) — Cloud, Private Cloud, Self-Hosted and Embedded.
7. [`06-integrations-automation.md`](06-integrations-automation.md) — GitHub-first integrations, automation and ingestion.
8. [`07-api-events.md`](07-api-events.md) — API conventions, events and webhooks.
9. [`08-security-privacy.md`](08-security-privacy.md) — security, privacy and customer isolation.
10. [`09-ux-information-architecture.md`](09-ux-information-architecture.md) — dashboard, navigation and responsive UX.
11. [`10-roadmap.md`](10-roadmap.md) — implementation phases and release gates.
12. [`11-operations-observability.md`](11-operations-observability.md) — CI/CD, telemetry, backup and runtime operations.
13. [`12-commercial-packaging.md`](12-commercial-packaging.md) — packaging and deployment editions.
14. [`12-standalone-release.md`](12-standalone-release.md) — hardened standalone profile, release gate, backup and restore.
15. [`13-decisions.md`](13-decisions.md) — architectural/product decisions already agreed.
16. [`13-github-signals.md`](13-github-signals.md) — normalized GitHub repository/PR/issue/CI/release signals.
17. [`14-development.md`](14-development.md) — local workspace, Docker stack and engineering quality gate.
18. [`14-integration-signal-persistence.md`](14-integration-signal-persistence.md) — durable provider-neutral signal history.
19. [`15-standalone-auth.md`](15-standalone-auth.md) — persistent standalone local login, sessions and connected Today flow.
20. [`15-integration-sync-job-queue.md`](15-integration-sync-job-queue.md) — durable integration refresh queue, leases and retries.
21. [`16-github-background-refresh.md`](16-github-background-refresh.md) — asynchronous GitHub refresh execution.
22. [`17-github-recurring-refresh.md`](17-github-recurring-refresh.md) — recurring reconciliation scheduling.
23. [`18-github-verified-webhooks.md`](18-github-verified-webhooks.md) — verified webhook ingestion and replay protection.
24. [`19-integration-signal-alert-derivation.md`](19-integration-signal-alert-derivation.md) — provider-neutral operational alert derivation.
25. [`20-integration-signal-alert-lifecycle.md`](20-integration-signal-alert-lifecycle.md) — automatic resolve/reopen lifecycle for derived alerts.
26. [`21-integration-activity-surface.md`](21-integration-activity-surface.md) — workspace dashboard surface for normalized integration activity.
27. [`22-github-setup-ui.md`](22-github-setup-ui.md) — admin-only GitHub connection and repository setup surface.
28. [`23-github-maintenance-ui.md`](23-github-maintenance-ui.md) — safe token rotation, repository unlink and unused-connection removal.
29. [`24-github-webhook-ui.md`](24-github-webhook-ui.md) — safe manual GitHub webhook provisioning, one-time secret reveal, rotation and removal.
30. [`25-automation-rule-policies.md`](25-automation-rule-policies.md) — workspace-scoped enable/severity policies for deterministic built-in automation rules.
31. [`26-automation-rule-policy-ui.md`](26-automation-rule-policy-ui.md) — ES/EN workspace administration surface for the proven built-in automation policies.
32. [`27-stale-work-rules.md`](27-stale-work-rules.md) — provider-neutral stale pull-request/issue rules, configurable inactivity window and lifecycle semantics.
33. [`28-explainable-prioritization.md`](28-explainable-prioritization.md) — deterministic cross-source task/alert ranking with explicit score reasons.
34. [`29-project-milestone-priority-risk.md`](29-project-milestone-priority-risk.md) — deterministic project/milestone delivery-risk contributions in the explainable ranking.
35. [`30-prioritization-weight-policies.md`](30-prioritization-weight-policies.md) — workspace-scoped configurable weights for deterministic explainable prioritization.
36. [`31-prioritization-weight-ui.md`](31-prioritization-weight-ui.md) — ES/EN workspace editor and safe same-origin mutation boundary for prioritization weights.
37. [`32-stale-threshold-policies.md`](32-stale-threshold-policies.md) — workspace-scoped 1..365-day inactivity thresholds for the two stale-work rules.
38. [`33-stale-threshold-ui.md`](33-stale-threshold-ui.md) — ES/EN stale-work threshold editor and strict same-origin mutation boundary.
39. [`34-task-dependencies.md`](34-task-dependencies.md) — explicit same-scope acyclic task dependency graph, guarded mutation and transactional audit.
40. [`35-dependency-prioritization.md`](35-dependency-prioritization.md) — deterministic dependency-chain impact scoring with legacy weight-policy compatibility.
41. [`36-task-dependency-ui.md`](36-task-dependency-ui.md) — ES/EN task dependency editor over the guarded same-origin mutation boundary.
42. [`37-dependency-start-readiness.md`](37-dependency-start-readiness.md) — server-authoritative start guard and complete scoped dependency catalog/readiness UI.
43. [`38-task-reminders.md`](38-task-reminders.md) — explicit one-time task reminder rules, guarded mutation and transactional audit.
44. [`39-task-reminder-materialization.md`](39-task-reminder-materialization.md) — deterministic worker materialization of due one-time reminders into scope-safe in-app alerts.
45. [`40-task-reminder-ui.md`](40-task-reminder-ui.md) — ES/EN task reminder editor with authenticated time-zone conversion and strict same-origin mutation boundary.
46. [`41-task-recurrence.md`](41-task-recurrence.md) — explicit fixed-day task recurrence intent, guarded mutation and transactional audit.
47. [`42-task-recurrence-ui.md`](42-task-recurrence-ui.md) — ES/EN recurrence editor over the guarded recurrence mutation boundary.
48. [`43-task-recurrence-materialization.md`](43-task-recurrence-materialization.md) — exactly-once worker materialization of completed recurring tasks into the next scoped occurrence.
49. [`44-task-deadline-alerts.md`](44-task-deadline-alerts.md) — deterministic overdue-task alert creation, auto-resolution, reopening and dismissal-safe lifecycle.
50. [`45-project-deadline-alerts.md`](45-project-deadline-alerts.md) — deterministic overdue-project alert creation, auto-resolution, reopening and dismissal-safe lifecycle.
51. [`46-milestone-deadline-alerts.md`](46-milestone-deadline-alerts.md) — deterministic overdue-milestone alert creation, auto-resolution, reopening and dismissal-safe lifecycle.
52. [`47-phase-5-release-boundary.md`](47-phase-5-release-boundary.md) — Phase 5 objective evidence, final 15-workflow technical boundary and explicitly deferred backlog.
53. [`48-phase-7-release-boundary.md`](48-phase-7-release-boundary.md) — Phase 7 governed Agent Bridge execution/security evidence, final 18-workflow boundary and explicitly deferred retry/cancel lifecycle backlog.

## Living documents / Documentos vivos

- [`../STATUS.md`](../STATUS.md) — current execution status.
- [`../CHANGELOG.md`](../CHANGELOG.md) — release history.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — contribution and engineering workflow.

## Documentation rule / Regla

Every architecture-changing PR must update the corresponding document and, when needed, add a decision entry to `13-decisions.md`.  
Toda PR que cambie la arquitectura debe actualizar el documento correspondiente y, cuando aplique, registrar la decisión en `13-decisions.md`.
