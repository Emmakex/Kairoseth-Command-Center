# Project status / Estado del proyecto

**Current phase:** Phase 5 — Automation and intelligence  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Status:** Phase 5 Slice 5 is merged as `f533c480ea841e61303819e63df3d5801f6ec54d` and post-merge validated 9/9. Phase 5 Slice 6 — Prioritization weight policies / Políticas de pesos de priorización — is active.

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

- [x] Repository links, encrypted connections, live sync and durable provider-neutral signals.
- [x] Retryable background/recurring refresh and verified webhook ingestion.
- [x] Deterministic derived-alert lifecycle and integration activity UI.
- [x] Admin setup/maintenance/webhook UI with session-bound one-time secret reveal.
- [x] Final Phase 4 closure commit `d1bfa929b6b2aa409991949513218826f10c2bb0` validated 9/9.

**Phase 4 token-backed GitHub boundary: CLOSED / CERRADA.**

### Phase 5 Slice 1 — Automation rule policies

- [x] Workspace-scoped enable/severity policies for versioned deterministic built-in CI rules.
- [x] `automation.manage`, guarded API, worker reconciliation and transactional audit lifecycle.
- [x] PR #33 merged as `3bda1db529e46e9f52ce1cf4cf4726495fa6a0e4`; resulting `main` validated 9/9.

**Phase 5 Slice 1: CLOSED / CERRADA.**

### Phase 5 Slice 2 — Automation rule policy UI

- [x] ES/EN workspace administration surface for built-in automation rules.
- [x] Workspace-only loading and safe same-origin allow-listed mutations.
- [x] PR #34 merged as `37755e580fef985dfda96645f7ccc86704a84e08`; resulting `main` validated 9/9.

**Phase 5 Slice 2: CLOSED / CERRADA.**

### Phase 5 Slice 3 — Stale work rules

- [x] Provider-neutral stale PR/issue rules with fixed seven-day v1 threshold.
- [x] Opt-in defaults, stable fingerprints and resolve/reopen lifecycle.
- [x] Existing policy API/UI configures the rules in ES/EN.
- [x] PR #35 merged as `1a88ae5280d0115fbdf2e61834859d6847bcc77e`; resulting `main` validated 9/9.

**Phase 5 Slice 3: CLOSED / CERRADA.**

### Phase 5 Slice 4 — Explainable prioritization

- [x] Deterministic task/alert ranking with explicit reason contributions and 100-point cap.
- [x] Authenticated `GET /v1/priorities`, timezone-aware day boundaries and ES/EN Today panel.
- [x] PR #36 merged as `375b9d2ecef75243f6335732bd1f6e646df1c3f0`; resulting `main` validated 9/9.

**Phase 5 Slice 4: CLOSED / CERRADA.**

### Phase 5 Slice 5 — Project/milestone priority risk

- [x] Projects and milestones participate in the same deterministic ranking as tasks and alerts.
- [x] Project risk: blocked `+45`, overdue `+35`, due today `+20`, remaining progress up to `+20` only when due/overdue.
- [x] Milestone risk: overdue `+40`, due today `+25`, normalized milestone weight up to `+20`.
- [x] Non-risk future/completed entities remain excluded.
- [x] API requires task/alert/project/milestone read capabilities; ES/EN UI presents every new reason.
- [x] Unit/API coverage and `docs/29-project-milestone-priority-risk.md`.
- [x] PR #37 merged as `f533c480ea841e61303819e63df3d5801f6ec54d`.
- [x] Resulting `main` validated with all nine workflows green.

**Phase 5 Slice 5: CLOSED / CERRADA.**

## Active / Activo

### Phase 5 Slice 6 — Prioritization weight policies / Políticas de pesos de priorización

Implemented on `feat/phase-5-priority-weight-policies` so far:

- [x] All current deterministic score contributions are represented by an explicit `PrioritizationWeights` policy.
- [x] Product defaults reproduce Slice 5 scoring exactly when no override exists.
- [x] `rankOperationalPriorities()` accepts partial explicit weights while preserving stable reason codes and the 100-point score cap.
- [x] Workspace-scoped durable `prioritization_weight_policies` storage with one policy per workspace.
- [x] Every weight is validated as an integer in `0..100`; unknown values fail closed at the API boundary.
- [x] Transactional `prioritization.weights_changed` audit-outbox event records previous/effective weights.
- [x] `GET /v1/prioritization/weights` returns effective defaults or workspace override.
- [x] `PATCH /v1/prioritization/weights` accepts only allow-listed partial weight changes and derives workspace/actor from session.
- [x] Policy administration requires `automation.manage` plus `command-center` entitlement.
- [x] Workspace priorities load effective workspace weights; private priorities intentionally keep product defaults.
- [x] Runtime/server initializes the policy store and indexes.
- [x] API/unit coverage for defaults, partial updates, isolation, authorization, invalid inputs and workspace-vs-private application.
- [x] Architecture/product documentation in `docs/30-prioritization-weight-policies.md`.
- [ ] Final-head regression validation.
- [ ] Merge and post-merge `main` validation.

**Phase 5 Slice 6: VALIDATION PENDING / VALIDACIÓN PENDIENTE.**

## Deliberately deferred / Diferido expresamente

- [ ] Customer-facing ES/EN prioritization-weight editor UI.
- [ ] Dependency-chain scoring and dependency data-model/mutation work; no dependency model exists yet.
- [ ] Customer-configurable stale thresholds.
- [ ] Arbitrary user-authored conditions or rule DSL.
- [ ] Automation actions beyond current derived-alert behavior.
- [ ] AI-generated automation rules, weights or silent priority changes.
- [ ] GitHub App/OAuth and additional providers.

## Security and correctness invariants

1. Workspace/private scope is server-derived from authenticated context.
2. Product entitlement and capability checks are server-enforced.
3. Provider credentials never enter durable jobs, signals, alerts, policies, prioritization or audit events.
4. Derived automation consumes normalized durable signals and remains provider-neutral.
5. Versioned rule IDs and deterministic alert fingerprints remain stable.
6. Private scope never loads workspace automation administration or workspace prioritization-weight overrides.
7. Human dismissed decisions remain authoritative under the alert lifecycle.
8. Priority ranking is deterministic, explainable and does not require AI.
9. Every priority contribution uses a stable reason code; localization never changes scoring.
10. Priority scoring remains read-only and never triggers external actions.
11. Missing prioritization weight policy preserves the exact historical product defaults.
12. Workspace weight policies are unique per workspace, integer-bounded and audited transactionally.
13. Workspace policy changes cannot alter private-scope ranking behavior.
14. Final scores remain capped at 100 regardless of configured contributions.
15. Dependency-chain scoring remains separate until dependency data is explicitly modelled and authorized.

## Next / Siguiente

1. Validate the final Slice 6 head with lint, typecheck, tests, build and all existing regression workflows.
2. Correct any policy/runtime regression directly on this slice.
3. Merge the exact validated head and revalidate resulting `main`.
4. Then implement the ES/EN customer-facing weight editor as its own isolated slice.
5. Keep dependency chains, stale-threshold customization, AI suggestions, external automation actions, OAuth and additional providers as separate fronts.
6. When commercial publication is scheduled, create the Kairoseth Software catalog entry as **Gestor de Trabajo / Work Manager**.

## Current blockers / Bloqueos actuales

No known product blocker. Slice 6 is ready for regression validation.

## Operating rule

Update this file at meaningful milestones. Keep Phase 5 deterministic, explainable, auditable, workspace-isolated and independently releasable; AI may assist but must not become required for core correctness.
