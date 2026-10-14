import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { IntegrationConnection, Scope } from '@kcc/domain';
import { buildApp } from '../src/application';
import type {
  CreateGitHubConnectionInput,
  DeleteGitHubConnectionResult,
  GitHubConnectionStore,
} from '../src/github-connection-store';

type WorkspaceScope = Extract<Scope, { kind: 'workspace' }>;

const adminSession: SessionContext = {
  user: {
    id: 'user-admin',
    email: 'admin@example.com',
    displayName: 'Admin',
    locale: 'es',
    timezone: 'Europe/Madrid',
  },
  activeWorkspaceId: 'workspace-a',
  membershipId: 'membership-admin',
  role: 'admin',
  capabilities: ['integrations.manage'],
  productEntitlements: ['command-center'],
};

const provider: AuthProvider = {
  name: 'test',
  async resolveSession(input) {
    return input.authorization === 'Bearer valid-token' ? adminSession : null;
  },
};

class MemoryGitHubConnectionStore implements GitHubConnectionStore {
  connections: IntegrationConnection[] = [];
  credentials = new Map<string, string>();
  lastCreateInput?: CreateGitHubConnectionInput;
  inUseIds = new Set<string>();

  async ensureIndexes(): Promise<void> {}

  async createConnection(input: CreateGitHubConnectionInput): Promise<IntegrationConnection> {
    this.lastCreateInput = input;
    const now = '2026-10-14T18:00:00.000Z';
    const connection: IntegrationConnection = {
      id: `connection-${this.connections.length + 1}`,
      scope: input.scope,
      provider: 'github',
      displayName: input.displayName,
      status: 'active',
      secretRef: `secret-${this.connections.length + 1}`,
      createdAt: now,
      updatedAt: now,
    };
    this.connections.push(connection);
    this.credentials.set(connection.id, input.token);
    return connection;
  }

  async listConnections(scope: WorkspaceScope): Promise<IntegrationConnection[]> {
    return this.connections.filter(
      (connection) => connection.scope.workspaceId === scope.workspaceId,
    );
  }

  async rotateCredential(
    scope: WorkspaceScope,
    _actorUserId: string,
    connectionId: string,
    token: string,
  ): Promise<IntegrationConnection | null> {
    const connection = this.connections.find(
      (candidate) =>
        candidate.id === connectionId && candidate.scope.workspaceId === scope.workspaceId,
    );
    if (!connection) return null;
    this.credentials.set(connection.id, token);
    connection.updatedAt = '2026-10-14T19:00:00.000Z';
    return connection;
  }

  async deleteConnection(
    scope: WorkspaceScope,
    _actorUserId: string,
    connectionId: string,
  ): Promise<DeleteGitHubConnectionResult> {
    const index = this.connections.findIndex(
      (candidate) =>
        candidate.id === connectionId && candidate.scope.workspaceId === scope.workspaceId,
    );
    if (index < 0) return { status: 'not_found' };
    if (this.inUseIds.has(connectionId)) return { status: 'in_use' };
    const [connection] = this.connections.splice(index, 1);
    if (!connection) return { status: 'not_found' };
    this.credentials.delete(connectionId);
    return { status: 'deleted', connection };
  }

  async resolveCredential(scope: WorkspaceScope, connectionId: string): Promise<string | null> {
    const connection = this.connections.find(
      (candidate) =>
        candidate.id === connectionId && candidate.scope.workspaceId === scope.workspaceId,
    );
    return connection ? this.credentials.get(connectionId) ?? null : null;
  }
}

const headers = { authorization: 'Bearer valid-token' };

describe('GitHub connection API', () => {
  it('derives workspace from the session and never returns token or secretRef', async () => {
    const store = new MemoryGitHubConnectionStore();
    const app = buildApp({ authProvider: provider, githubConnectionStore: store });
    const token = 'github_pat_test_12345678901234567890';

    const response = await app.inject({
      method: 'POST',
      url: '/v1/integrations/github/connections',
      headers,
      payload: {
        workspaceId: 'workspace-attacker',
        displayName: 'Primary GitHub',
        token,
        secretRef: 'attacker-controlled',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(store.lastCreateInput?.scope).toEqual({ kind: 'workspace', workspaceId: 'workspace-a' });
    expect(store.lastCreateInput?.token).toBe(token);
    expect(response.body).not.toContain(token);
    expect(response.body).not.toContain('secretRef');
    expect(response.json().connection.credentialConfigured).toBe(true);
    await app.close();
  });

  it('denies members without integrations.manage', async () => {
    const store = new MemoryGitHubConnectionStore();
    const memberProvider: AuthProvider = {
      name: 'member',
      async resolveSession() {
        return {
          ...adminSession,
          role: 'member',
          capabilities: ['projects.read'],
        };
      },
    };
    const app = buildApp({ authProvider: memberProvider, githubConnectionStore: store });

    const listed = await app.inject({
      method: 'GET',
      url: '/v1/integrations/github/connections',
      headers,
    });
    expect(listed.statusCode).toBe(403);

    const created = await app.inject({
      method: 'POST',
      url: '/v1/integrations/github/connections',
      headers,
      payload: {
        displayName: 'Blocked',
        token: 'github_pat_test_12345678901234567890',
      },
    });
    expect(created.statusCode).toBe(403);
    await app.close();
  });

  it('rotates credentials without exposing them and protects in-use connections', async () => {
    const store = new MemoryGitHubConnectionStore();
    const connection = await store.createConnection({
      scope: { kind: 'workspace', workspaceId: 'workspace-a' },
      actorUserId: 'user-admin',
      displayName: 'Primary GitHub',
      token: 'github_pat_old_12345678901234567890',
    });
    const app = buildApp({ authProvider: provider, githubConnectionStore: store });
    const rotatedToken = 'github_pat_new_12345678901234567890';

    const rotated = await app.inject({
      method: 'PATCH',
      url: `/v1/integrations/github/connections/${connection.id}/credential`,
      headers,
      payload: { token: rotatedToken },
    });
    expect(rotated.statusCode).toBe(200);
    expect(rotated.body).not.toContain(rotatedToken);
    expect(rotated.body).not.toContain('secretRef');
    expect(await store.resolveCredential(connection.scope, connection.id)).toBe(rotatedToken);

    store.inUseIds.add(connection.id);
    const blockedDelete = await app.inject({
      method: 'DELETE',
      url: `/v1/integrations/github/connections/${connection.id}`,
      headers,
    });
    expect(blockedDelete.statusCode).toBe(409);
    expect(blockedDelete.json().error).toBe('github_connection_in_use');
    await app.close();
  });

  it('fails closed when the encrypted connection store is not configured', async () => {
    const app = buildApp({ authProvider: provider });
    const response = await app.inject({
      method: 'GET',
      url: '/v1/integrations/github/connections',
      headers,
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe('github_connection_store_unavailable');
    await app.close();
  });
});
