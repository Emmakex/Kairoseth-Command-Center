# Project status / Estado del proyecto

**Current phase:** Phase 7 — Agent Bridge execution and security — **ACTIVE / ACTIVA**  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Phase 5 product release:** CLOSED / CERRADA  
**Agent Bridge current merged boundary:** `main` `3968f1d768f8e3d06f4a67dfdf1e923c5487e301`  

## Naming rule / Regla de naming

- **ES:** Gestor de Trabajo
- **EN:** Work Manager
- `Kairoseth Command Center` remains the technical/internal repository name.
- Public product names do **not** use `Kairoseth` as a prefix; Kairoseth is the vendor/catalog brand.

## Closed product boundaries / Límites de producto cerrados

### Phase 3 — Operational product

- [x] Portable monorepo, standalone authentication and strict workspace/private isolation.
- [x] Projects, Tasks, Alerts, Decisions, Timeline, Quick Capture and Milestones.
- [x] Transactional audit outbox, production-oriented standalone profile, backup and guarded restore.

**Status: CLOSED / CERRADA.**

### Phase 4 — GitHub integration

- [x] Repository links, encrypted connections, live sync and provider-neutral signals.
- [x] Retryable background/recurring refresh and verified webhook ingestion.
- [x] Deterministic derived-alert lifecycle and integration activity/setup/maintenance/webhook UI.
- [x] Final Phase 4 closure commit `d1bfa929b6b2aa409991949513218826f10c2bb0` validated 9/9.

**Status: CLOSED / CERRADA.**

### Phase 5 — Automation and intelligence

- [x] Configurable deterministic rules/automation.
- [x] Explainable prioritization and configurable weights.
- [x] Task dependencies and start readiness.
- [x] One-time reminders and materialization.
- [x] Fixed-day recurrence and exactly-once materialization.
- [x] Task, project and milestone overdue-alert lifecycles.
- [x] Core correctness remains AI-independent.
- [x] Runtime boundary `d7eb0769bfed765727a851635eca41006ee412c2` validated with the full 15-workflow regression set.
- [x] Formal closure merged as `f327c584be4bc55deec710dc6e61d0746ae57958`.

Detailed slice history remains in `docs/47-phase-5-release-boundary.md`.

**Status: CLOSED / CERRADA.**

### Commercial publication / Publicación comercial

- [x] **Gestor de Trabajo / Work Manager** published in the Kairoseth Software catalog.
- [x] Canonical catalog route: `/products/work-manager`.
- [x] ES/EN landing, metadata, structured data, sitemap and Growth lifecycle profile delivered.
- [x] Kairoseth Platform publication PR #507 merged as `0d07c14894560096053498a32a4e14d12ec3f1ae`.
- [x] Hostinger deployment acceptance observed the publication revision in production.

**Status: COMPLETE / COMPLETADA.**

## Agent Bridge expansion / Expansión Agent Bridge

### Phase 6 — Shared runtime foundation and observability

- [x] PR #50 — authoritative MongoDB-backed shared A2A task storage with atomic claims and exact workspace scope.
- [x] PR #52 — workspace-scoped Agent Bridge observability foundation and ES/EN operator surface.
- [x] PR #54 — authenticated enrollment/session/heartbeat/runtime-snapshot flow with Ed25519 installation identity and safe runtime health projection.
- [x] Runtime tokens are short lived, server-bound and stored only as digests.
- [x] Operator sessions cannot impersonate runtime telemetry.

**Phase 6 Platform boundary: COMPLETE / COMPLETA.**

### Phase 7 — Execution plane and mutation security

Delivered on merged `main`:

- [x] PR #62 — Mongo-backed READ command delivery, scoped pull/ACK and deterministic action fingerprints.
- [x] PR #64 — real ProductionRuntime READ acceptance through the WooCommerce connector.
- [x] PR #65 — per-workspace Ed25519 signing for WRITE/CRITICAL approvals plus durable runtime audit ingestion.
- [x] PR #67 — mutation-boundary hardening, secret redaction and permanent negative/acceptance coverage.
- [x] Chained approval-key rotation using `old -> [old,new] -> [new]`, runtime generation acknowledgements and encrypted old-key retirement.
- [x] Current API exposes workspace-authorized rotation status/start while remaining fail-closed on generation mismatch.
- [x] PR #70 — ES/EN approval-key rotation controls merged as `3968f1d768f8e3d06f4a67dfdf1e923c5487e301`; the UI exposes only generation, phase and trusted-key count and never renders key material or tokens.
- [x] The full 18-workflow post-merge regression set for `3968f1d7...` completed successfully.
- [x] Hosted-runner MongoDB kernel incompatibility discovered during the following documentation validation was isolated from product code and fixed in PR #72 without changing the standalone MongoDB 8.x profile.

**Current validation:** Phase 7 rotation/UI boundary is green. No delivered Agent Bridge regression is open.

## Current gap / Hueco actual

The execution backend is ahead of the operator UX. Platform can already queue and execute READ plus signed WRITE/CRITICAL commands, but the Agent Bridge web surface does not yet provide a complete human execution console for selecting an observed tool, submitting safe arguments, requesting the correct approval path, and following command status/results.

## Next / Siguiente

1. Build the **Agent Bridge operator execution console** as the next Phase 7 microphase.
2. The console must use only tools advertised by the selected runtime snapshot and derive risk from Platform/runtime data; the browser must never invent risk, scope or approval tokens.
3. READ actions may use the existing READ queue path; WRITE/CRITICAL actions must use the existing signed approval endpoint and retain exact fingerprint binding.
4. Show command lifecycle/status and sanitized result/error projection without exposing approval tokens, runtime session tokens, PEM material or integration secrets.
5. Keep ES/EN parity and add negative tests plus ProductionRuntime acceptance before merging.

## Deliberately deferred / Diferido expresamente

These remain future candidates and do not reopen closed Phase 5 boundaries:

- Pre-deadline warning windows and configurable deadline severity.
- Monthly/calendar/weekday/local-wall-clock recurrence semantics.
- Recurring reminder regeneration for future occurrences.
- Email, push, SMS or third-party reminder/alert delivery.
- Snooze/repeat policies.
- Dedicated dependency graph/drag-and-drop editor.
- Automatic task status mutation driven by dependency changes.
- Critical-path or probabilistic deadline forecasting.
- Arbitrary executable user-authored rule DSL.
- AI-generated rules, weights, thresholds, dependencies, reminders, recurrence or silent priority changes.
- GitHub App/OAuth and additional work-management providers.

## Security and correctness invariants

1. Workspace/private scope is server-derived from authenticated context for user mutations.
2. Product entitlement and capability checks are server-enforced.
3. Provider credentials and runtime/control secrets never enter user-visible projections or ordinary domain state.
4. Agent Bridge enrollment, sessions, snapshots, command delivery and audit are tenant/installation/bridge scoped.
5. READ delivery accepts only currently advertised READ tools.
6. WRITE/CRITICAL execution requires short-lived signed approval bound to the exact tenant, installation, tool, correlation ID and action fingerprint.
7. Approval tokens are delivered only to the runtime and are never returned in operator command projections.
8. Approval private keys remain encrypted through the integration-secret store and retired key material is removed only after safe runtime convergence.
9. Runtime audit ingestion is scope checked, idempotent and defensively redacted before durable persistence.
10. Browser forms never choose authoritative tenant, actor, risk class or approval material.
11. Derived automation and prioritization remain deterministic, explainable and AI-independent.
12. ES/EN remains a product invariant for every operator surface.

## Current blockers / Bloqueos actuales

**None / Ninguno.** The Phase 7 rotation/UI boundary is green, the hosted-runner compatibility issue is fixed, and the next development slice has a defined execution/security contract.

## Operating rule

Keep delivered runtime deterministic, explainable, auditable, workspace-isolated and independently releasable. New Agent Bridge capabilities must reuse the accepted control/session/signing/audit boundaries instead of creating parallel execution or secret-handling paths.
