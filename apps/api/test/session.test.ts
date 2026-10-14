import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import { buildApp } from '../src/app';

const session: SessionContext = {
  user: {
    id: 'user-1',
    email: 'user@example.com',
    displayName: 'User One',
    locale: 'es',
    timezone: 'Europe/Madrid',
  },
  activeWorkspaceId: 'workspace-a',
  membershipId: 'membership-1',
  role: 'member',
  capabilities: ['projects.read', 'tasks.read', 'tasks.write'],
  productEntitlements: ['command-center'],
};

const provider: AuthProvider = {
  name: 'test',
  async resolveSession(input) {
    return input.authorization === 'Bearer valid-token' ? session : null;
  },
};

describe('GET /v1/session', () => {
  it('denies access when no auth provider is configured', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/v1/session' });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('denies invalid credentials', async () => {
    const app = buildApp({ authProvider: provider });
    const response = await app.inject({
      method: 'GET',
      url: '/v1/session',
      headers: { authorization: 'Bearer invalid-token' },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns only resolved session context for valid credentials', async () => {
    const app = buildApp({ authProvider: provider });
    const response = await app.inject({
      method: 'GET',
      url: '/v1/session',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({
      activeWorkspaceId: 'workspace-a',
      role: 'member',
      productEntitlements: ['command-center'],
    });

    await app.close();
  });
});
