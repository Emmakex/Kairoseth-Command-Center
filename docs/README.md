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
14. [`13-decisions.md`](13-decisions.md) — architectural/product decisions already agreed.
15. [`14-development.md`](14-development.md) — local workspace, Docker stack and Phase 1 quality gate.
16. [`15-standalone-auth.md`](15-standalone-auth.md) — standalone local login, signed sessions and connected Today flow.

## Living documents / Documentos vivos

- [`../STATUS.md`](../STATUS.md) — current execution status.
- [`../CHANGELOG.md`](../CHANGELOG.md) — release history.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — contribution and engineering workflow.

## Documentation rule / Regla

Every architecture-changing PR must update the corresponding document and, when needed, add a decision entry to `13-decisions.md`.  
Toda PR que cambie la arquitectura debe actualizar el documento correspondiente y, cuando aplique, registrar la decisión en `13-decisions.md`.
