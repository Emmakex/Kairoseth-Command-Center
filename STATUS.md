# Project status / Estado del proyecto

**Current phase:** Phase 3 — standalone release boundary  
**Technical/internal project:** Kairoseth Command Center  
**Commercial names:** Gestor de Trabajo (ES) / Work Manager (EN)  
**Category:** Kairoseth Software  
**Status:** PR #13 merged and post-merge validated. PR #14 hardens the standalone production-oriented release boundary and is at final merge validation.

## Naming rule / Regla de naming

- **ES:** Gestor de Trabajo
- **EN:** Work Manager
- `Kairoseth Command Center` remains the technical/internal repository name.
- Public product names do **not** use `Kairoseth` as a prefix; Kairoseth is the vendor/catalog brand.
- ES and EN commercial names/descriptors are defined independently.

## Completed / Completado

### Phase 0 — Foundation
- [x] Product, architecture, portability, tenancy, security and commercial model documented.
- [x] ES/EN commercial naming rule documented.

### Phase 1 — Core shell
- [x] Portable monorepo, web/API/worker, ES/EN, Docker and CI baseline.
- [x] PR #1 merged.

### Phase 2 — Identity, workspaces and permissions
- [x] Server-side session context, workspaces, memberships, RBAC/capabilities and product entitlements.
- [x] Strict workspace/private boundaries and negative isolation tests.
- [x] PR #2 merged.

### Phase 3 — Operational product
- [x] Projects, Tasks, Alerts, Decisions and Timeline foundations.
- [x] Scoped MongoDB persistence and server-derived workspace/private boundaries.
- [x] Quick Capture and operational mutations.
- [x] Weighted Milestones with project progress recalculation.
- [x] Standalone login/bootstrap and authenticated Today dashboard.
- [x] ES/EN operational UI.
- [x] Milestone management and Decision Log UI.
- [x] Scoped Timeline/audit UI.
- [x] Validated Decision create/supersede/reverse lifecycle.
- [x] Transactional audit outbox, idempotent Timeline delivery and worker processing.
- [x] All current manual mutation families migrated to transactional audit delivery.
- [x] PRs #3–#12 merged with their quality gates green.

### Phase 3 — Persistent standalone multi-user identities
- [x] Mongo-backed `users`, `workspaces`, `memberships` and separate `local_credentials`.
- [x] Unique normalized identity/membership/credential indexes.
- [x] `scrypt-v1` password derivation with random salt; no plaintext password persistence.
- [x] Persistent local sessions re-resolve User + Workspace + Membership + credential version.
- [x] Bootstrap owner persists only when the credential store is empty.
- [x] `owner` / `admin` / `member` capability model; owner protected from management mutations.
- [x] Member-management API protected by `members.manage`.
- [x] Password change/reset invalidates all older bearer sessions immediately through password versioning.
- [x] Identity/password lifecycle audited through the transactional outbox.
- [x] ES/EN account/password and member-management UI.
- [x] Route-level member denial, owner-protection and stale-session tests.
- [x] Dedicated multi-user Docker smoke.
- [x] PR #13 merged as `da3c72194e81f502a7b63d96bd9cb5dfebaa93b2`.
- [x] PR #13 post-merge `main` CI and Local identities smoke green.

### Phase 3 — Standalone production-oriented release boundary (PR #14)
- [x] Separate `docker-compose.standalone.yml`; development compose remains unchanged.
- [x] API/worker/web run with `NODE_ENV=production` in the standalone profile.
- [x] Required owner email/password/HMAC secret fail closed when missing.
- [x] Required values are empty in `.env.standalone.example`; no production defaults.
- [x] `.dockerignore` excludes `.env` and `.env.*` from Docker build contexts.
- [x] MongoDB is not published to the host and remains on the internal backend network.
- [x] API/web host bindings default to `127.0.0.1`; remote access is intended through a TLS reverse proxy.
- [x] API also joins the frontend Docker network so its loopback host binding remains reachable while Mongo stays isolated.
- [x] Backup helper creates a compressed MongoDB archive plus SHA-256 checksum.
- [x] Restore helper verifies checksum when available and requires `KCC_RESTORE_CONFIRM=RESTORE`.
- [x] Standalone release smoke validates production build/start, API readiness, ES/EN routes, multi-user lifecycle, Mongo non-publication, backup, restore and post-restore authentication.
- [x] Dedicated `Standalone release gate` GitHub Actions workflow.
- [x] Standalone install/release/backup/restore documentation and updated README.

## Validation / Validación

Historical merged gates:

- [x] PR #6 → main CI #30 green.
- [x] PR #7 → main CI #36 green.
- [x] PR #8 → main CI #39 green.
- [x] PR #9 → main CI #42 green.
- [x] PR #10 → main CI #49 green.
- [x] PR #11 → main CI #57 green.
- [x] PR #12 → main CI #64 green.
- [x] PR #13 → final CI + Local identities smoke green; merged and post-merge validated.

PR #14 implementation validation on `f0145cf48d4cf8bd6d0b4893d6d922fed93b8577`:

- [x] CI #94 — lint, typecheck, tests, build, dependency audit, secret scan and transactional Docker smoke green.
- [x] Local identities smoke #20 — green.
- [x] Standalone release gate #7 — green, including backup/restore and post-restore login.

The first standalone gate attempt correctly exposed a Docker-network topology issue: API was healthy internally but its loopback host publication was unreachable while attached only to the internal network. The profile was corrected by attaching API to both backend and frontend networks while retaining loopback-only publication. The complete release smoke then passed.

**Final merge rule:** after this status synchronization, the same three gates must be green again on the final PR #14 head before merge.

## Security invariants

1. Workspace/private scope is derived from the authenticated session, never authorized by raw client tenant/user IDs.
2. Product entitlement and capability checks are server-enforced.
3. MongoDB queries include the applicable scope boundary.
4. Decisions are workspace-only and project/supersede references resolve inside the authenticated workspace.
5. Timeline events are server-authored and delivered idempotently through the transactional outbox.
6. Browser operational forms use fixed same-product proxies and cannot choose arbitrary upstream paths.
7. Standalone browser sessions are HTTP-only; bearer tokens are not persisted in browser storage.
8. Standalone passwords are never persisted in plaintext.
9. Password change/reset immediately invalidates older local sessions.
10. Normal members cannot administer identities; `members.manage` is required.
11. Standalone owner protection is enforced at the HTTP boundary.
12. Production-oriented standalone MongoDB is not published to the host.
13. Standalone required credentials/secrets fail closed when absent.
14. Runtime `.env` files are excluded from Docker build contexts.

## Next / Siguiente

1. Run the three final PR #14 gates on this synchronized head.
2. Merge PR #14 only if all three are green.
3. Verify CI, Local identities smoke and Standalone release gate again on `main`.
4. With those post-merge gates green, close the Phase 3 standalone technical release boundary.
5. Continue with Phase 4 GitHub integration.
6. When commercial publication is scheduled, create the Kairoseth Software catalog entry as **Gestor de Trabajo / Work Manager**.

## Current blockers / Bloqueos actuales

No functional blocker. PR #14 is in final automated validation.

## Operating rule

Update this file at meaningful milestones. Do not use it as a substitute for detailed roadmap/issues documentation.
