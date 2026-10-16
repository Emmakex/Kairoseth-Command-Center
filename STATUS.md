# Project status / Estado del proyecto

**Current phase:** Phase 5 — Automation and intelligence  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Status:** Phase 5 Slice 1 is merged and post-merge validated 9/9 on `3bda1db529e46e9f52ce1cf4cf4726495fa6a0e4`. Phase 5 Slice 2 — Automation rule policy UI / UI de políticas de reglas de automatización — is active.

## Naming rule / Regla de naming

- **ES:** Gestor de Trabajo
- **EN:** Work Manager
- `Kairoseth Command Center` remains the technical/internal repository name.
- Public product names do **not** use `Kairoseth` as a prefix; Kairoseth is the vendor/catalog brand.
- ES and EN commercial names/descriptors are defined independently.

## Completed / Completado

### Phase 3 — Operational product

- [x] Portable monorepo, standalone authentication and strict workspace/private isolation.
- [x] Projects, Tasks, Alerts, Decisions, Timeline, Quick Capture and Milestones.
- [x] Transactional audit outbox, production-oriented standalone profile, backup and guarded restore.

**Phase 3 technical release boundary: CLOSED / CERRADA.**

### Phase 4 — GitHub integration

- [x] Normalized repository links and encrypted GitHub connections.
- [x] Live validation + manual repository sync.
- [x] Durable provider-neutral PR/issue/CI/release signal history.
- [x] Durable integration queue, worker retries and recurring reconciliation.
- [x] Verified GitHub webhooks with raw-body HMAC verification and replay protection.
- [x] Provider-neutral derived alerts with deterministic fingerprints.
- [x] Automatic derived-alert resolve/reopen lifecycle.
- [x] Workspace integration activity UI.
- [x] Admin GitHub setup and maintenance UI.
- [x] Manual webhook provision/rotate/remove UI with session-bound one-time secret reveal.
- [x] Final Phase 4 closure commit `d1bfa929b6b2aa409991949513218826f10c2bb0` validated with all nine workflows green.

**Phase 4 token-backed GitHub boundary: CLOSED / CERRADA.**

Deferred GitHub enhancements are not Phase 4 blockers:

- [ ] GitHub App/OAuth authorization and automatic webhook registration/removal.
- [ ] Additional integration providers.

### Phase 5 Slice 1 — Automation rule policies / Políticas de reglas de automatización

- [x] Versioned built-in CI rule definitions with unchanged Phase 4 defaults.
- [x] Workspace-scoped durable policy overrides for `enabled` and `severity`.
- [x] Dedicated `automation.manage` capability for owner/admin presets.
- [x] `GET /v1/automation/rules` and guarded `PATCH /v1/automation/rules/:ruleId`.
- [x] Transactional policy-change and alert-policy audit events.
- [x] Worker reconciliation applies effective policies without changing deterministic alert identities.
- [x] Severity changes update eligible active alerts in place.
- [x] Disabling a built-in rule resolves matching active derived alerts without deleting history.
- [x] Unit/API/background-refresh acceptance coverage.
- [x] PR #33 merged as `3bda1db529e46e9f52ce1cf4cf4726495fa6a0e4`.
- [x] Resulting `main` validated with all nine workflows green.

**Phase 5 Slice 1: CLOSED / CERRADA.**

## Active / Activo

### Phase 5 Slice 2 — Automation rule policy UI / UI de políticas de reglas de automatización

Implemented on `feat/phase-5-rule-policy-ui` so far:

- [x] ES/EN workspace administration panel for the two proven built-in CI rules.
- [x] Friendly ES/EN rule labels while retaining versioned rule IDs as technical context.
- [x] Enable/disable and severity controls for `info`, `warning`, `urgent`, `critical`.
- [x] Default-vs-custom effective policy indicator.
- [x] Dashboard loads rule policies only in workspace scope when the session has `automation.manage`.
- [x] Private scope does not load or render rule administration.
- [x] Same-origin web mutation boundary forwards only allow-listed policy changes to the authenticated API.
- [x] Mutation parser rejects arbitrary rule IDs, invalid booleans and invalid severities.
- [x] Unit coverage for the web mutation parser.
- [x] Architecture/operations documentation in `docs/26-automation-rule-policy-ui.md`.
- [ ] Final-head regression validation.
- [ ] Merge and post-merge `main` validation.

**Phase 5 Slice 2: VALIDATION PENDING / VALIDACIÓN PENDIENTE.**

## Deliberately deferred / Diferido expresamente

- [ ] Arbitrary user-authored conditions or rule DSL.
- [ ] Stale PR/issue built-in rules.
- [ ] Automation actions beyond current derived-alert behavior.
- [ ] AI-generated automation rules.
- [ ] GitHub App/OAuth and additional providers.

## Security and correctness invariants

1. Workspace/private scope is server-derived from authenticated context.
2. Product entitlement and capability checks are server-enforced.
3. Integration administration requires `integrations.manage`; automation policy administration requires `automation.manage`.
4. GitHub repository links, connections and webhook management are workspace-only.
5. Standalone passwords and provider credentials are never persisted in plaintext.
6. Provider credentials never enter durable jobs, schedules, signals, alerts, automation policies or audit events.
7. Provider responses are normalized before persistence or client exposure.
8. Webhook HMAC secrets remain independent from provider credentials and encrypted at rest.
9. Derived alert rules consume normalized durable signals and remain provider-neutral.
10. Built-in rule IDs and deterministic alert fingerprints remain versioned and stable across workspace policy changes.
11. Missing workspace policy overrides preserve the Phase 4 default behavior exactly.
12. Workspace policy storage is unique by workspace + built-in rule ID; arbitrary rule IDs are rejected.
13. Disabling a built-in rule resolves active derived conditions instead of deleting alerts or audit history.
14. Severity policy changes update only eligible open/acknowledged derived alerts and do not override dismissed human decisions.
15. Every stored policy change and derived-alert policy mutation is delivered through the transactional audit outbox.
16. The customer-facing rule-policy UI never widens the executable rule allow-list defined by the API/runtime.
17. Private scope never loads or renders workspace automation administration.

## Next / Siguiente

1. Validate the final Slice 2 head with lint, typecheck, tests, build and all existing regression workflows.
2. Correct any UI/web-boundary regression directly on this slice.
3. Merge the exact validated head and revalidate resulting `main`.
4. Only then select the next isolated Phase 5 automation slice from the green repository state.
5. Keep custom DSL, stale PR/issue rules, AI rules, OAuth and additional providers as separate fronts.
6. When commercial publication is scheduled, create the Kairoseth Software catalog entry as **Gestor de Trabajo / Work Manager**.

## Current blockers / Bloqueos actuales

No known product blocker. Slice 2 is ready for regression validation.

## Operating rule

Update this file at meaningful milestones. Keep Phase 5 slices deterministic, auditable, workspace-isolated and independently releasable; never introduce arbitrary executable user logic into a red validation boundary.
