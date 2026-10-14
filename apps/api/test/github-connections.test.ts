import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { IntegrationConnection, Scope } from '@kcc/domain';
import { buildApp } from '../src/application';
import type {
  CreateGitHubConnectionInput,
  DeleteGitHubConnectionResult,
  GitHubConnectionStore,
} from '../src/github-connection-store';
import { GitHubProviderError } from '../src/github-provider-client';
import type { GitHubProviderClient } from '../src/github-provider-client';

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
      status: 'unverified',
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

  async getConnection(scope: WorkspaceScope, connectionId: string): Promise<IntegrationConnection | null> {
    return this.connections.find(
      (candidate) => candidate.id === connectionId && candidate.scope.workspaceId === scope.workspaceId,
    ) ?? null;
  }

  async rotateCredential(
    scope: WorkspaceScope,
    _actorUserId: string,
    connectionId: string,
    token: string,
  ): Promise<IntegrationConnection | null> {
    const connection = await this.getConnection(scope, connectionId);
    if (!connection) return null;
    this.credentials.set(connection.id, token);
    connection.status = 'unverified';
    delete connection.lastValidatedAt;
    delete connection.remoteAccountId;
    delete connection.remoteAccountLabel;
    delete connection.lastErrorCode;
    connection.updatedAt = '2026-10-14T19:00:00.000Z';
    return connection;
  }

  async markValidationSuccess(
    scope: WorkspaceScope,
    _actorUserId: string,
    connectionId: string,
    remoteAccount: { id: string; label: string },
  ): Promise<IntegrationConnection | null> {
    const connection = await this.getConnection(scope, connectionId);
    if (!connection) return null;
    connection.status = 'active';
    connection.lastValidatedAt = '2026-10-14T19:15:00.000Z';
    connection.remoteAccountId = remoteAccount.id;
    connection.remoteAccountLabel = remoteAccount.label;
    delete connection.lastErrorCode;
    return connection;
  }

  async markValidationFailure(
    scope: WorkspaceScope,
    _actorUserId: string,
    connectionId: string,
    errorCode: string,
  ): Promise<IntegrationConnection | null> {
    const connection = await this.getConnection(scope, connectionId);
    if (!connection) return null;
    connection.status = 'error';
    connection.lastErrorCode = errorCode;
    delete connection.lastValidatedAt;
    delete connection.remoteAccountId;
    delete connection.remoteAccountLabel;
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

  async resolveCredential(
    scope: WorkspaceScope,
    connectionId: string,
    options: { requireActive?: boolean } = {},
  ): Promise<string | null> {
    const connection = await this.getConnection(scope, connectionId);
    if (!connection || connection.status === 'disabled') return null;
    if (options.requireActive && connection.status !== 'active') return null;
    return this.credentials.get(connectionId) ?? null;
  }
}

class MemoryGitHubProviderClient implements GitHubProviderClient {
  shouldFail = false;
  tokens: string[] = [];

  async validateCredential(token: string) {
    this.tokens.push(token);
    if (this.shouldFail) throw new GitHubProviderError('unauthorized', 'fixture_invalid');
    return { id: '101', login: 'fixture-owner' };
  }

  async getRepository() {
    throw new Error('not_used');
  }

  async getLatestCommit() {
    throw new Error('not_used');
  }
}

const headers = { authorization: 'Bearer valid-token' };
const fixtureCredential = 'fixture-credential-12345678901234567890';

describe('GitHub connection API', () => {
  it('derives workspace from the session and never returns token or secretRef', async () => {
    const store = new MemoryGitHubConnectionStore();
    const app = buildApp({ authProvider: provider, githubConnectionStore: store });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/integrations/github/connections',
      headers,
      payload: {
        workspaceId: 'workspace-attacker',
        displayName: 'Primary GitHub',
        token: fixtureCredential,
        secretRef: 'attacker-controlled',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(store.lastCreateInput?.scope).toEqual({ kind: 'workspace', workspaceId: 'workspace-a' });
    expect(store.lastCreateInput?.token).toBe(fixtureCredential);
    expect(response.body).not.toContain(fixtureCredential);
    expect(response.body).not.toContain('secretRef');
    expect(response.json().connection.credentialConfigured).toBe(true);
    expect(response.json().connection.status).toBe('unverified');
    await app.close();
  });

  it('validates remotely before promoting a connection to active', async () => {
    const store = new MemoryGitHubConnectionStore();
    const remote = new MemoryGitHubProviderClient();
    const connection = await store.createConnection({
      scope: { kind: 'workspace', workspaceId: 'workspace-a' },
      actorUserId: 'user-admin',
      displayName: 'Primary GitHub',
      token: fixtureCredential,
    });
    const app = buildApp({
      authProvider: provider,
      githubConnectionStore: store,
      githubProviderClient: remote,
    });

    const validated = await app.inject({
      method: 'POST',
      url: `/v1/integrations/github/connections/${connection.id}/validate`,
      headers,
    });
    expect(validated.statusCode).toBe(200);
    expect(validated.json().connection.status).toBe('active');
    expect(validated.json().connection.remoteAccountId).toBe('101');
    expect(validated.json().connection.remoteAccountLabel).toBe('fixture-owner');
    expect(validated.body).not.toContain(fixtureCredential);
    expect(remote.tokens).toEqual([fixtureCredential]);
    await app.close();
  });

  it('normalizes provider rejection and persists error state', async () => {
    const store = new MemoryGitHubConnectionStore();
    const remote = new MemoryGitHubProviderClient();
    remote.shouldFail = true;
    const connection = await store.createConnection({
      scope: { kind: 'workspace', workspaceId: 'workspace-a' },
      actorUserId: 'user-admin',
      displayName: 'Rejected GitHub',
      token: fixtureCredential,
    });
    const app = buildApp({
      authProvider: provider,
      githubConnectionStore: store,
      githubProviderClient: remote,
    });

    const validated = await app.inject({
      method: 'POST',
      url: `/v1/integrations/github/connections/${connection.id}/validate`,
      headers,
    });
    expect(validated.statusCode).toBe(422);
    expect(validated.json().error).toBe('github_connection_invalid_credential');
    expect((await store.getConnection(connection.scope, connection.id))?.status).toBe('error');
    expect((await store.getConnection(connection.scope, connection.id))?.lastErrorCode).toBe('unauthorized');
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
      payload: { displayName: 'Blocked', token: fixtureCredential },
    });
    expect(created.statusCode).toBe(403);
    await app.close();
  });

  it('rotation returns a connection to unverified without exposing credential material', async () => {
    const store = new MemoryGitHubConnectionStore();
    const connection = await store.createConnection({
      scope: { kind: 'workspace', workspaceId: 'workspace-a' },
      actorUserId: 'user-admin',
      displayName: 'Primary GitHub',
      token: fixtureCredential,
    });
    await store.markValidationSuccess(connection.scope, 'user-admin', connection.id, {
      id: '101',
      label: 'fixture-owner',
    });
    const app = buildApp({ authProvider: provider, githubConnectionStore: store });
    const rotatedToken = 'fixture-credential-rotated-09876543210987654321';

    const rotated = await app.inject({
      method: 'PATCH',
      url: `/v1/integrations/github/connections/${connection.id}/credential`,
      headers,
      payload: { token: rotatedToken },
    });
    expect(rotated.statusCode).toBe(200);
    expect(rotated.json().connection.status).toBe('unverified');
    expect(rotated.json().connection.lastValidatedAt).toBeUndefined();
    expect(rotated.body).not.toContain(rotatedToken);
    expect(rotated.body).not.toContain('secretRef');
    expect(await store.resolveCredential(connection.scope, connection.id)).toBe(rotatedToken);
    await app.close();
  });

  it('protects in-use connections from deletion', async () => {
    const store = new MemoryGitHubConnectionStore();
    const connection = await store.createConnection({
      scope: { kind: 'workspace', workspaceId: 'workspace-a' },
      actorUserId: 'user-admin',
      displayName: 'Primary GitHub',
      token: fixtureCredential,
    });
    store.inUseIds.add(connection.id);
    const app = buildApp({ authProvider: provider, githubConnectionStore: store });

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
