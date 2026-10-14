# Project status / Estado del proyecto

**Current phase:** Phase 2 — Identity, workspaces and permissions complete  
**Product:** Kairoseth Command Center  
**Category:** Kairoseth Software  
**Status:** Phase 2 exit gate passed on PR #2; ready to merge and begin Phase 3.

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

### Phase 2 — Identity, workspaces and permissions
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

## Validation / Validación

PR #2 CI run #10 passed the complete Phase 2 quality gate after one strict-TypeScript fix:

- [x] install.
- [x] lint.
- [x] TypeScript validation.
- [x] automated tests, including tenant/private negative tests.
- [x] production build.
- [x] dependency audit.
- [x] secret scan.
- [x] Docker Compose build/runtime smoke test.
- [x] API/web baseline smoke tests.

The first CI attempt exposed an `exactOptionalPropertyTypes` mismatch in the API auth request object. It was fixed by omitting absent credential fields rather than weakening the TypeScript configuration.

## Security invariants verified

1. UI role selection never grants authorization.
2. A workspace administrator cannot cross tenant boundaries.
3. Workspace ownership/admin does not reveal another user's private data.
4. Product access can require entitlement in addition to authorization.
5. `platform_admin` is not a portable customer role and is valid only in Kairoseth-hosted context.
6. Protected API responses never expose credentials or raw tokens.

## Next / Siguiente

1. Merge PR #2 into `main`.
2. Start Phase 3 — Operational core.
3. Implement persistence/repository boundaries for Projects, Milestones, Tasks, Alerts, Timeline and Decisions.
4. Add Personal/private reminders using the same strict private scope.
5. Build the first useful `Today` vertical slice and quick capture.
6. Close Phase 3 only when the product is useful manually with no external integration.

## Phase 2 exit gate

**PASSED.**

- session context is resolved server-side;
- workspace membership and role/capability authorization pass;
- cross-tenant negative tests pass;
- private-scope negative tests pass;
- local/Kairoseth identity adapter contracts remain portable;
- CI/security/Docker gates are green.

## Current blockers / Bloqueos actuales

None.

## Operating rule

Update this file at meaningful milestones. Do not use it as a substitute for detailed issues/roadmap; it is the concise project snapshot.
