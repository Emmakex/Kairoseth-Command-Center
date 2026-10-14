# 04 — Authentication, tenancy & RBAC / Autenticación, tenancy y permisos

## Core rule / Regla principal

The login interface may let a user choose a desired access mode, but **authorization is always resolved server-side**. Selecting “Kairoseth Administrator”, “Owner”, “Administrator” or “Member” must never grant that role.

La interfaz puede permitir seleccionar un tipo de acceso, pero **la autorización siempre se resuelve en servidor**. Elegir un rol en pantalla nunca lo concede.

## Identity abstraction

Command Center must use an authentication provider contract:

- `kairoseth` — Kairoseth Platform identity.
- `local` — standalone credentials for self-hosted/private installations.
- `oidc` — enterprise identity provider.
- `saml` — future enterprise SSO.

Authentication answers “who are you?”. Authorization separately answers “what can you access?”.

## Tenant model

A customer company is represented by a `Workspace`/organization security boundary. A user can belong to multiple workspaces.

```text
User
  |- Membership -> Kairoseth
  |- Membership -> Emmake
  `- Membership -> Customer X
```

Switching workspace changes the active tenant context and all workspace-scoped data.

## Roles

Initial logical roles:

- `platform_admin`: Kairoseth-level operational administration. Only valid in the Kairoseth-hosted platform context.
- `owner`: ownership, billing/entitlements and full control of a specific workspace/product subscription.
- `admin`: operational management inside the authorized workspace.
- `member`: day-to-day authorized work.

Self-hosted editions may map customer roles to the same capability model without exposing Kairoseth platform roles.

## Capabilities

Authorization should be capability-based behind the role presets. Examples:

- `workspace.manage`
- `members.manage`
- `projects.read`
- `projects.write`
- `tasks.read`
- `tasks.write`
- `alerts.manage`
- `integrations.manage`
- `products.access:<product>`
- `billing.manage`
- `internal.development.read`

Roles are convenient bundles; capabilities are the enforceable permission units.

## Product entitlements

Access requires both permission and entitlement where applicable:

```text
identity + active membership + capability + product entitlement
```

A customer that buys only Command Center must not see Product Security, Agent Bridge or other Kairoseth products.

## Private/personal scope

Private items belong to the user, not the company. Workspace owners/admins do not automatically gain access to a user's private tasks or reminders.

Required rule:

```text
private.ownerUserId == authenticatedUser.id
```

for normal access to private content.

## Session context

Every authenticated request should resolve:

- `userId`
- `activeWorkspaceId` (nullable only for private-only flows)
- `membershipId`
- `roles/capabilities`
- `productEntitlements`
- `locale`
- `timezone`

## Security controls

- Deny by default.
- Server-side authorization on every protected action.
- No cross-tenant object lookup by raw ID without tenant qualification.
- Rate limiting on login and sensitive endpoints.
- MFA/SSO readiness.
- Session invalidation after membership/role revocation.
- Audit events for role, entitlement and integration changes.
