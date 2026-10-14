# 12 — Commercial packaging / Empaquetado comercial

## Product family

Kairoseth Command Center belongs to **Kairoseth Software**.

The commercial model should preserve one product core and vary hosting, support, integrations and enterprise capabilities rather than creating incompatible forks.

## Edition A — Kairoseth Cloud

Best for SMEs and teams that want zero infrastructure management.

Potential characteristics:
- multi-tenant SaaS;
- Kairoseth Identity;
- automatic updates;
- managed backups;
- standard integrations;
- subscription pricing.

## Edition B — Kairoseth Private Cloud

Best for customers that require stronger isolation without operating the stack themselves.

Potential characteristics:
- dedicated environment;
- private database/runtime;
- optional custom domain;
- dedicated backup/retention policy;
- managed upgrades;
- premium support/SLA options.

## Edition C — Self-Hosted / On-Premise

Best for regulated, enterprise or infrastructure-controlled environments.

Potential characteristics:
- containerized deployment;
- local/OIDC identity;
- customer-controlled database and networking;
- documented offline/private operation assumptions;
- upgrade packages and migration tooling;
- annual software/support agreement.

## Edition D — Enterprise Embedded

Future option for customers that want Command Center functionality inside an existing intranet or application.

Potential characteristics:
- API/SDK;
- SSO/SAML/SCIM;
- advanced audit and policy controls;
- white-label/embedded UI options subject to commercial model.

## Functional core that must remain available across editions

- projects;
- tasks;
- alerts;
- timeline;
- decisions;
- role/permission model;
- private vs workspace scope;
- integration framework;
- ES/EN.

Cloud-only dependencies must not contaminate this core.

## Optional commercial differentiators

Possible differentiators later:
- number of users/workspaces;
- connector catalog;
- automation volume;
- AI usage tier;
- retention period;
- advanced reporting;
- SSO/SCIM;
- HA deployment;
- dedicated support/SLA;
- audit/export features.

## Important pricing rule

Do not finalize pricing until the MVP resource profile and operating cost are measurable. Packaging can be defined before exact prices.

## Positioning statement

**EN:** One intelligent command center for projects, tasks, alerts, decisions and the signals your team cannot afford to miss — in our cloud or yours.

**ES:** Un centro de mando inteligente para proyectos, tareas, alertas, decisiones y las señales que tu equipo no se puede permitir olvidar — en nuestra nube o en la tuya.
