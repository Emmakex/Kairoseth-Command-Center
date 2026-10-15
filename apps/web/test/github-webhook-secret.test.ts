import { describe, expect, it } from 'vitest';
import {
  renderGitHubWebhookSecretHtml,
  sealGitHubWebhookSecret,
  unsealGitHubWebhookSecret,
} from '../lib/github-webhook-secret';

describe('GitHub webhook one-time secret reveal', () => {
  it('seals and unseals the secret only with the matching session token', () => {
    const sessionToken = 'session-token-for-tests';
    const secret = 'webhook-secret-for-tests';
    const path = '/v1/integrations/github/webhooks/ghwh_test';
    const sealed = sealGitHubWebhookSecret(sessionToken, { path, secret });

    expect(sealed).toBeTruthy();
    expect(sealed).not.toContain(secret);
    expect(sealed).not.toContain(path);

    const reveal = unsealGitHubWebhookSecret(sessionToken, sealed!);
    expect(reveal?.path).toBe(path);
    expect(reveal?.secret).toBe(secret);
    expect(unsealGitHubWebhookSecret('different-session', sealed!)).toBeNull();
  });

  it('rejects tampered and expired reveal state', () => {
    const sessionToken = 'session-token-for-tests';
    const sealed = sealGitHubWebhookSecret(sessionToken, {
      path: '/v1/integrations/github/webhooks/ghwh_test',
      secret: 'webhook-secret-for-tests',
    });
    expect(sealed).toBeTruthy();

    const tampered = `${sealed!.slice(0, -1)}${sealed!.endsWith('a') ? 'b' : 'a'}`;
    expect(unsealGitHubWebhookSecret(sessionToken, tampered)).toBeNull();

    const issued = unsealGitHubWebhookSecret(sessionToken, sealed!)?.issuedAt;
    expect(issued).toBeTypeOf('number');
    expect(unsealGitHubWebhookSecret(sessionToken, sealed!, issued! + 3 * 60 * 1000 + 1)).toBeNull();
  });

  it('rejects invalid reveal paths before sealing', () => {
    expect(
      sealGitHubWebhookSecret('session-token-for-tests', {
        path: 'https://attacker.example/secret',
        secret: 'webhook-secret-for-tests',
      }),
    ).toBeNull();
  });

  it('escapes secret and path content in the one-time HTML', () => {
    const html = renderGitHubWebhookSecretHtml('en', {
      path: '/v1/integrations/github/webhooks/ghwh_<unsafe>',
      secret: '<script>alert(1)</script>',
      issuedAt: Date.now(),
    });

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('ghwh_&lt;unsafe&gt;');
  });
});
