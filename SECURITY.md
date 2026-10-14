# Security policy / Política de seguridad

## Supported versions

The project is currently pre-release. Security support/version windows will be defined before the first stable release.

## Reporting a vulnerability

Do **not** open a public GitHub issue for vulnerabilities that could expose customer data, authentication bypasses, cross-tenant access, secret leakage or remote code execution.

Until a dedicated security reporting channel is published, contact the maintainers privately through the repository owner's established private channel. A formal reporting address/process will be added before public production release.

## Priority vulnerability classes

Reports are especially important for:

- cross-tenant/workspace data access;
- exposure of private/personal tasks;
- authentication or authorization bypass;
- platform-admin privilege escalation;
- product-entitlement bypass;
- connector token/secret leakage;
- webhook signature bypass/replay;
- injection, SSRF, XSS, CSRF and remote code execution;
- insecure self-hosted defaults;
- backup/export data exposure.

## Disclosure process

Target process after a valid private report:

1. acknowledge receipt;
2. reproduce/triage severity;
3. prepare a fix and tests;
4. release supported patches;
5. coordinate disclosure after affected users can update.

Exact SLA commitments will be defined with the commercial support model.

## Secure development requirements

- deny-by-default authorization;
- tenant-qualified data access;
- private-scope ownership tests;
- secret scanning;
- dependency scanning;
- no credentials in source/logs;
- verified inbound webhooks;
- idempotent integration processing;
- auditable sensitive changes.

See `docs/08-security-privacy.md` for the full baseline.
