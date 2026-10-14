# Project status / Estado del proyecto

**Current phase:** Phase 2 — Identity, workspaces and permissions  
**Product:** Kairoseth Command Center  
**Category:** Kairoseth Software  
**Status:** Authorization core implemented on `feat/phase-2-identity-workspaces`; CI validation pending.

## Completed / Completado

### Phase 0 — Foundation
- [x] Product, architecture, portability, tenancy, security and commercial model documented.

### Phase 1 — Core shell
- [x] Portable pnpm monorepo.
- [x] Web + API + worker.
- [x] Shared packages and adapter boundaries.
- [x] ES/EN from the first UI route.
- [x] MongoDB-ready local runtime.
- [x] Health/readiness endpoints.
- [x] Docker Compose stack.
- [x] CI, dependency audit, secret scan and Docker smoke validation.
- [x] Phase 1 merged to `main` in PR #1.

### Phase 2 — implemented on feature branch
- [x] `User`, `Workspace` and `Membership` domain entities.
- [x] Workspace types/status and membership lifecycle.
- [x] Role presets: `platform_admin`, `owner`, `admin`, `member`.
- [x] Capability-based server-side authorization.
- [x] Product entitlement checks.
- [x] Strict workspace scope enforcement.
- [x] Strict private-user scope enforcement.
- [x] `platform_admin` restricted to the Kairoseth workspace context.
- [x] Session context includes locale/timezone, membership, role, capabilities and entitlements.
- [x] Portable `AuthProvider` and `SessionCredentialResolver` contracts.
- [x] Local auth adapter contract.
- [x] Kairoseth Identity adapter contract.
- [x] Protected `GET /v1/session` server-side session resolver.
- [x] Cross-tenant negative authorization tests.
- [x] Private-scope negative authorization tests.
- [x] Suspended membership negative test.
- [x] Invalid credential/session API tests.

## Validation pending / Validación pendiente

- [ ] Phase 2 PR opened.
- [ ] lint/typecheck/tests/build green.
- [ ] dependency audit green.
- [ ] secret scan green.
- [ ] Docker smoke green with the new auth package dependency graph.

## Security invariants under test

1. UI role selection never grants authorization.
2. A workspace administrator cannot cross tenant boundaries.
3. Workspace ownership/admin does not reveal another user's private data.
4. Product access requires entitlement in addition to authorization when applicable.
5. `platform_admin` is not a portable customer role and is valid only in Kairoseth-hosted context.
6. Protected API responses never expose credentials or raw tokens.

## Next / Siguiente

1. Open Phase 2 pull request.
2. Run the full CI and Docker smoke gate.
3. Fix failures without weakening tenant/private boundaries.
4. Merge Phase 2 when the negative tests and all quality gates are green.
5. Start Phase 3 — operational core: Projects, Milestones, Tasks, Alerts, Timeline, Decisions, Personal and Today.

## Phase 2 exit gate

Phase 2 closes only when:

- session context is resolved server-side;
- workspace membership and role/capability authorization pass;
- cross-tenant negative tests pass;
- private-scope negative tests pass;
- local/Kairoseth identity adapter contracts remain portable;
- CI/security/Docker gates are green.

## Current blockers / Bloqueos actuales

None documented. Runtime validation is pending.

## Operating rule

Update this file at meaningful milestones. Do not use it as a substitute for detailed issues/roadmap; it is the concise project snapshot.
