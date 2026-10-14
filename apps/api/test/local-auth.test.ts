import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/application';
import { StandaloneLocalAuthProvider } from '../src/local-auth';

const testSigningSecret = Array.from({ length: 10 }, () => 'test').join('-');

function provider() {
  return new StandaloneLocalAuthProvider({
    email: 'owner@example.com',
    password: 'correct-horse-battery-staple',
    secret: testSigningSecret,
    displayName: 'Local Owner',
    locale: 'es',
    timezone: 'Europe/Madrid',
    userId: 'local-owner',
    workspaceId: 'local-workspace',
    workspaceName: 'Local Workspace',
    sessionTtlSeconds: 3600,
  });
}

describe('standalone local authentication', () => {
  it('issues a signed session and resolves it through the standard session endpoint', async () => {
    const auth = provider();
    const app = buildApp({ authProvider: auth, standaloneAuthProvider: auth });

    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/local/login',
      payload: {
        email: 'owner@example.com',
        password: 'correct-horse-battery-staple',
      },
    });

    expect(login.statusCode).toBe(200);
    expect(login.headers['cache-control']).toBe('no-store');
    const body = login.json() as { accessToken: string; activeWorkspaceId: string; role: string };
    expect(body.accessToken).toContain('.');
    expect(body.activeWorkspaceId).toBe('local-workspace');
    expect(body.role).toBe('owner');

    const session = await app.inject({
      method: 'GET',
      url: '/v1/session',
      headers: { authorization: `Bearer ${body.accessToken}` },
    });

    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      activeWorkspaceId: 'local-workspace',
      role: 'owner',
      productEntitlements: ['command-center'],
    });

    await app.close();
  });

  it('rejects invalid credentials without exposing which field failed', async () => {
    const auth = provider();
    const app = buildApp({ authProvider: auth, standaloneAuthProvider: auth });

    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/local/login',
      payload: {
        email: 'owner@example.com',
        password: 'wrong-password',
      },
    });

    expect(login.statusCode).toBe(401);
    expect(login.json()).toEqual({ error: 'invalid_credentials' });
    await app.close();
  });

  it('rejects a tampered bearer token', async () => {
    const auth = provider();
    const result = await auth.authenticate('owner@example.com', 'correct-horse-battery-staple');
    expect(result).not.toBeNull();

    const token = result?.accessToken ?? '';
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
    const session = await auth.resolveSession({ authorization: `Bearer ${tampered}` });

    expect(session).toBeNull();
  });
});
