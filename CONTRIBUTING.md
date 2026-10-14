# Contributing / Contribuir

## Engineering principles

- Keep domain logic independent from Kairoseth-specific adapters.
- Preserve tenant and private-scope isolation.
- Maintain ES/EN parity for user-facing features.
- Prefer small, testable vertical changes.
- Document architecture-changing decisions.
- Never commit credentials or customer data.

## Branch and PR workflow

Recommended branch names:

- `feat/...`
- `fix/...`
- `docs/...`
- `refactor/...`
- `chore/...`

Before opening a PR:

1. run formatting/lint;
2. run type checks;
3. run unit/integration tests;
4. run build;
5. verify no secrets are included;
6. update documentation/status when behavior or architecture changes;
7. verify both ES and EN for user-visible changes.

## Pull request content

Every meaningful PR should state:

- what changes;
- why it changes;
- tenant/security impact;
- migration/config impact;
- tests performed;
- screenshots for UI work;
- documentation updated;
- rollback/recovery notes when relevant.

## Architecture decisions

If a change affects product boundaries, deployment modes, tenancy, authentication, persistence, public API or integration contracts, add/update an entry in `docs/13-decisions.md`.

## Definition of done

A change is done when:

- acceptance behavior works;
- automated checks pass;
- authorization has been considered/tested;
- error states are handled;
- observability is sufficient for production diagnosis;
- ES/EN is complete where applicable;
- docs are current;
- no temporary debug output/secrets remain.

## Commit guidance

Use concise imperative messages, for example:

- `feat: add workspace task creation`
- `fix: enforce private task ownership`
- `docs: record OIDC adapter decision`

## Review priorities

Review in this order:

1. security/data isolation;
2. correctness;
3. portability;
4. backward compatibility;
5. maintainability;
6. UX/accessibility;
7. performance.
