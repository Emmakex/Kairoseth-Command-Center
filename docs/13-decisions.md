# 13 — Decision log / Registro de decisiones

This document records decisions already agreed for the product. New architecture-changing decisions should be appended, not silently overwritten.

## D-001 — Product category
**Decision:** Kairoseth Command Center is a **Kairoseth Software** product.  
**Status:** Accepted.

## D-002 — Autonomous product
**Decision:** Command Center is not implemented as inseparable dashboard logic inside Kairoseth Platform. It is an autonomous product that Kairoseth can host/integrate.  
**Reason:** Customers must be able to use it independently or take it to their own infrastructure.  
**Status:** Accepted.

## D-003 — Kairoseth can use it as default cockpit
**Decision:** Kairoseth internal users may use Command Center as their primary operational landing experience, but this is configuration/integration, not a hard dependency of the product core.  
**Status:** Accepted.

## D-004 — Multiple deployment modes
**Decision:** Architecture supports Kairoseth Cloud, Private Cloud and Self-Hosted/On-Premise. Enterprise Embedded remains a planned extension.  
**Status:** Accepted.

## D-005 — Authentication adapter
**Decision:** Core domain logic does not depend directly on Kairoseth login. Authentication is abstracted through providers/adapters such as Kairoseth Identity, local, OIDC and future SAML.  
**Status:** Accepted.

## D-006 — Server-side role resolution
**Decision:** A login-screen role selector never grants authorization. Roles, capabilities, memberships and product entitlements are validated server-side.  
**Status:** Accepted.

## D-007 — Multi-tenant workspace model
**Decision:** Company/team information is isolated by workspace/organization. One user may belong to multiple workspaces and select the active context.  
**Status:** Accepted.

## D-008 — Private personal scope
**Decision:** Personal tasks/reminders belong to the user and are not automatically readable by workspace owners or administrators.  
**Status:** Accepted.

## D-009 — GitHub first
**Decision:** GitHub is the first external integration used to enrich projects with commits, PRs, issues, CI/workflow and release signals.  
**Status:** Accepted.

## D-010 — Progress must be evidence-based
**Decision:** Project percentages shown as authoritative must come from milestones, tasks, explicit manual tracking with provenance, or external normalized metrics.  
**Status:** Accepted.

## D-011 — AI assistance, deterministic core
**Decision:** AI can assist capture, summaries and prioritization, but core task/project/permission behavior must work without AI and high-impact external actions require explicit policy/authorization.  
**Status:** Accepted.

## D-012 — ES/EN from the beginning
**Decision:** Spanish and English are first-class release locales from the first UI implementation.  
**Status:** Accepted.

## D-013 — Initial technology direction
**Decision:** Target a TypeScript/Next.js-oriented web stack with separate application/API/worker responsibilities and MongoDB-compatible persistence for alignment with current Kairoseth infrastructure, while keeping persistence behind interfaces.  
**Status:** Working decision; validate in Phase 1 before freezing implementation details.

## Decision template

```md
## D-XXX — Title
**Decision:** ...
**Context:** ...
**Consequences:** ...
**Status:** Proposed | Accepted | Superseded | Rejected
**Supersedes:** D-XXX (optional)
```
