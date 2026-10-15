import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { ExternalResource, IntegrationConnection, Scope } from '@kcc/domain';
import { buildApp } from '../src/application';
import type { GitHubConnectionStore } from '../src/github-connection-store';
import { GitHubProviderError } from '../src/github-provider-client';
import type { GitHubProviderClient } from '../src/github-provider-client';
import type { GitHubRepositoryStore } from '../src/github-repository-store';

type WorkspaceScope = Extract<Scope, { kind: 'workspace' }>;

const memberSession: SessionContext = {
  user: {
    id: 'user-member',
    email: 'member@example.com',
    displayName: 'Member',
    locale: 'es',
    timezone: 'Europe/Madrid',
  },
  activeWorkspaceId: 'workspace-a',
  membershipId: 'membership-member',
  role: 'member',
  capabilities: ['projects.read'],
  productEntitlements: ['command-center'],
};

const authProvider: AuthProvider = {
  name: 'test',
  async resolveSession(input) {
    return input.authorization === 'Bearer valid-token' ? memberSession : null;
  },
};

const scope: WorkspaceScope = { kind: 'workspace', workspaceId: 'workspace-a' };
const resource: ExternalResource = {
  id: 'resource-1',
  scope,
  provider: 'github',
  kind: 'repository',
  externalId: 'emmakex/kairoseth-command-center',
  displayName: 'Emmakex/Kairoseth-Command-Center',
  url: 'https://github.com/Emmakex/Kairoseth-Command-Center',
  projectId: 'project-a',
  connectionId: 'connection-1',
  metadata: {
    owner: 'Emmakex',
    repository: 'Kairoseth-Command-Center',
  },
  createdAt: '2026-10-15T05:00:00.000Z',
  updatedAt: '2026-10-15T05:00:00.000Z',
};

const connection: IntegrationConnection = {
  id: 'connection-1',
  scope,
  provider: 'github',
  displayName: 'Primary GitHub',
  status: 'active',
  secretRef: 'secret-1',
  lastValidatedAt: '2026-10-15T05:00:00.000Z',
  remoteAccountId: '101',
  remoteAccountLabel: 'Emmakex',
  createdAt: '2026-10-15T05:00:00.000Z',
  updatedAt: '2026-10-15T05:00:00.000Z',
};

function repositoryStore(): GitHubRepositoryStore {
  return {
    async getRepositoryLink(requestScope, resourceId) {
      return requestScope.workspaceId === scope.workspaceId && resourceId === resource.id
        ? resource
        : null;
    },
  } as unknown as GitHubRepositoryStore;
}

function connectionStore(onFailure?: (errorCode: string) => void): GitHubConnectionStore {
  return {
    async getConnection(requestScope, connectionId) {
      return requestScope.workspaceId === scope.workspaceId && connectionId === connection.id
        ? connection
        : null;
    },
    async resolveCredential(requestScope, connectionId) {
      return requestScope.workspaceId === scope.workspaceId && connectionId === connection.id
        ? 'fixture-provider-token'
        : null;
    },
    async markValidationFailure(_scope, _actorUserId, _connectionId, errorCode) {
      onFailure?.(errorCode);
      return { ...connection, status: 'error', lastErrorCode: errorCode };
    },
  } as unknown as GitHubConnectionStore;
}

function signalProvider(): GitHubProviderClient {
  return {
    async validateCredential() {
      throw new Error('not_used');
    },
    async getRepository() {
      throw new Error('not_used');
    },
    async getLatestCommit() {
      throw new Error('not_used');
    },
    async listPullRequests(token, owner, repository, limit) {
      expect(token).toBe('fixture-provider-token');
      expect({ owner, repository, limit }).toEqual({
        owner: 'Emmakex',
        repository: 'Kairoseth-Command-Center',
        limit: 3,
      });
      return [
        {
          id: '501',
          number: 17,
          title: 'Ship GitHub signals',
          state: 'closed',
          draft: false,
          htmlUrl: 'https://github.com/Emmakex/Kairoseth-Command-Center/pull/17',
          updatedAt: '2026-10-15T06:00:00Z',
          mergedAt: '2026-10-15T05:59:00Z',
        },
      ];
    },
    async listIssues() {
      return [
        {
          id: '601',
          number: 20,
          title: 'Real issue',
          state: 'open',
          htmlUrl: 'https://github.com/Emmakex/Kairoseth-Command-Center/issues/20',
          updatedAt: '2026-10-15T05:00:00Z',
        },
      ];
    },
    async listWorkflowRuns() {
      return [
        {
          id: '701',
          name: 'CI',
          status: 'completed',
          conclusion: 'success',
          event: 'push',
          headBranch: 'main',
          headSha: 'abc123',
          htmlUrl: 'https://github.com/Emmakex/Kairoseth-Command-Center/actions/runs/701',
          updatedAt: '2026-10-15T06:30:00Z',
        },
      ];
    },
  };
}

const headers = { authorization: 'Bearer valid-token' };

describe('GitHub repository signals API', () => {
  it('allows project readers to consume normalized, recent-first signals without exposing credentials', async () => {
    const app = buildApp({
      authProvider,
      githubRepositoryStore: repositoryStore(),
      githubConnectionStore: connectionStore(),
      githubProviderClient: signalProvider(),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/integrations/github/repositories/resource-1/signals?limit=3',
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('fixture-provider-token');
    expect(response.body).not.toContain('secret-1');
    expect(response.json().signals).toMatchObject([
      {
        id: 'github:workflow-run:701',
        source: 'github',
        type: 'repository.ci',
        workspaceId: 'workspace-a',
        payload: {
          resourceId: 'resource-1',
          projectId: 'project-a',
          repository: 'Emmakex/Kairoseth-Command-Center',
          conclusion: 'success',
        },
      },
      {
        id: 'github:pull-request:501',
        type: 'repository.pull_request',
        payload: { number: 17, merged: true },
      },
      {
        id: 'github:issue:601',
        type: 'repository.issue',
        payload: { number: 20, state: 'open' },
      },
    ]);
    await app.close();
  });

  it('fails closed on provider 401 and invalidates the connection', async () => {
    let failureCode: string | undefined;
    const remote = signalProvider();
    remote.listPullRequests = async () => {
      throw new GitHubProviderError('unauthorized', 'fixture_invalid');
    };
    const app = buildApp({
      authProvider,
      githubRepositoryStore: repositoryStore(),
      githubConnectionStore: connectionStore((code) => {
        failureCode = code;
      }),
      githubProviderClient: remote,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/integrations/github/repositories/resource-1/signals',
      headers,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ error: 'github_connection_invalid_credential' });
    expect(failureCode).toBe('unauthorized');
    await app.close();
  });

  it('requires projects.read even when the integration exists', async () => {
    const restrictedProvider: AuthProvider = {
      name: 'restricted',
      async resolveSession() {
        return { ...memberSession, capabilities: [] };
      },
    };
    const app = buildApp({
      authProvider: restrictedProvider,
      githubRepositoryStore: repositoryStore(),
      githubConnectionStore: connectionStore(),
      githubProviderClient: signalProvider(),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/integrations/github/repositories/resource-1/signals',
      headers,
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });
});
