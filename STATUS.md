# Project status / Estado del proyecto

**Current phase:** Phase 5 — Automation and intelligence  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Status:** Phase 4 token-backed GitHub boundary is closed and post-merge validated 9/9 on `d1bfa929b6b2aa409991949513218826f10c2bb0`. Phase 5 Slice 1 — Automation rule policies / Políticas de reglas de automatización — is active.

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

## Active / Activo

### Phase 5 Slice 1 — Automation rule policies / Políticas de reglas de automatización

Implemented on `feat/phase-5-rule-policies`:

- [x] Existing built-in CI alert rules exported as explicit versioned definitions with unchanged defaults.
- [x] Workspace-scoped `signal_alert_rule_policies` persistence with unique workspace + rule identity.
- [x] Effective policy merge keeps Phase 4 behavior unchanged when no overrides exist.
- [x] Dedicated `automation.manage` capability granted to owner/admin presets, not members.
- [x] `GET /v1/automation/rules` returns effective policies for the authenticated workspace.
- [x] `PATCH /v1/automation/rules/:ruleId` changes `enabled` and/or `severity` for known built-in rules only.
- [x] API requires authenticated workspace, `automation.manage` and `command-center` entitlement.
- [x] Policy changes emit transactional `automation.rule_policy_changed` audit work.
- [x] Worker loads effective workspace policies before durable CI alert reconciliation.
- [x] Severity override changes the existing open/acknowledged derived alert in place without changing ID/fingerprint.
- [x] Severity update emits transactional `alert.policy_updated` audit work.
- [x] Disabling a rule suppresses its active candidate and lifecycle reconciliation resolves the existing derived alert rather than deleting history.
- [x] Pure rule tests cover historical defaults, severity override, disabled-rule resolution and rule isolation.
- [x] API tests cover defaults, partial update, workspace isolation, capability enforcement and invalid input.
- [x] Existing background-refresh Docker smoke strengthened to prove `urgent → critical → disabled/resolved` on the same durable alert/fingerprint.
- [x] Architecture/operations documentation in `docs/25-automation-rule-policies.md`.
- [ ] Final-head regression validation.
- [ ] Merge and post-merge `main` validation.

**Phase 5 Slice 1: VALIDATION PENDING / VALIDACIÓN PENDIENTE.**

## Deliberately deferred / Diferido expresamente

- [ ] Customer-facing ES/EN rule policy UI — next isolated slice after runtime/API foundation is green.
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

## Next / Siguiente

1. Require all existing regression workflows green on the final Slice 1 head, including the strengthened background-refresh smoke.
2. Correct any policy/runtime/API regression directly on this slice; do not open the UI slice while a gate is red.
3. Merge with the exact validated head and revalidate resulting `main`.
4. Start Phase 5 Slice 2 from that green commit: ES/EN workspace rule-policy administration UI for the two proven built-in rules.
5. Keep custom DSL, stale PR/issue rules, AI rules, OAuth and additional providers as separate fronts.
6. When commercial publication is scheduled, create the Kairoseth Software catalog entry as **Gestor de Trabajo / Work Manager**.

## Current blockers / Bloqueos actuales

No known product blocker. Slice 1 is ready for CI validation.

## Operating rule

Update this file at meaningful milestones. Keep Phase 5 slices deterministic, auditable, workspace-isolated and independently releasable; never introduce arbitrary executable user logic into a red validation boundary.
