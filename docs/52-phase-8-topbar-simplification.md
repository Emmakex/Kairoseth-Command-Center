# Phase 8 — Topbar simplification acceptance

## Goal

Reduce visual competition in the primary Work Manager navigation while preserving every existing capability.

## Accepted behavior

- The primary topbar exposes only the product identity, locale switch and one compact account control.
- Session identity and logout move inside the account control instead of occupying permanent horizontal space.
- Agent Bridge is no longer a primary-navigation peer of Today; when entitled, it remains discoverable under `More tools / Integrations`.
- Agent Bridge authorization and entitlement rules are unchanged.
- Locale switching preserves the current workspace/private scope.
- The account control uses native `details/summary`, remains keyboard accessible and does not require client-side JavaScript.
- Mobile hides the redundant display-name text while retaining the account avatar/control.
- ES and EN copy remain available.

## Non-goals

- No authentication changes.
- No authorization or entitlement changes.
- No Agent Bridge runtime changes.
- No new backend endpoints.
- No persistence changes.

## Regression gate

The normal Phase 8 CI and Live Preview matrices must remain green before merge. After merge, the accepted `main` revision must deploy to the OVH live reference and pass the public HTTPS probe.
