import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { ExternalResource, IntegrationConnection, Scope } from '@kcc/domain';
import type { IntegrationSignal } from '@kcc/integrations';
import type {
  IntegrationSignalStore,
  IntegrationSignalWriteResult,
  ListIntegrationSignalsInput,
} from '@kcc/persistence/integration-signals';
import { buildApp } from '../src/application';
import type { GitHubConnectionStore } from '../src/github-connection-store';
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

class MemoryIntegrationSignalStore implements IntegrationSignalStore {
  readonly signals = new Map<string, IntegrationSignal>();

  async ensureIndexes(): Promise<void> {}

  async upsertSignals(
    workspaceId: string,
    signals: IntegrationSignal[],
  ): Promise<IntegrationSignalWriteResult> {
    let upserted = 0;
    let matched = 0;
    for (const signal of signals) {
      if (signal.workspaceId !== workspaceId) throw new Error('integration_signal_workspace_mismatch');
      const key = `${workspaceId}:${signal.id}`;
      if (this.signals.has(key)) matched += 1;
      else upserted += 1;
      this.signals.set(key, signal);
    }
    return { received: signals.length, upserted, matched, modified: matched };
  }

  async listSignals(input: ListIntegrationSignalsInput): Promise<IntegrationSignal[]> {
    return [...this.signals.values()]
      .filter((signal) => signal.workspaceId === input.workspaceId)
      .filter((signal) => !input.resourceId || signal.payload.resourceId === input.resourceId)
      .filter((signal) => !input.projectId || signal.payload.projectId === input.projectId)
      .filter((signal) => !input.types?.length || input.types.includes(signal.type))
      .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
      .slice(0, input.limit ?? 50);
  }
}

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
  metadata: { owner: 'Emmakex', repository: 'Kairoseth-Command-Center' },
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
  createdAt: '2026-10-15T05:00:00.000Z',
  updatedAt: '2026-10-15T05:00:00.000Z',
};

function repositoryStore(): GitHubRepositoryStore {
  return {
    async getRepositoryLink(requestScope: WorkspaceScope, resourceId: string) {
      return requestScope.workspaceId === scope.workspaceId && resourceId === resource.id
        ? resource
        : null;
    },
  } as unknown as GitHubRepositoryStore;
}

function connectionStore(): GitHubConnectionStore {
  return {
    async getConnection(requestScope: WorkspaceScope, connectionId: string) {
      return requestScope.workspaceId === scope.workspaceId && connectionId === connection.id
        ? connection
        : null;
    },
    async resolveCredential(requestScope: WorkspaceScope, connectionId: string) {
      return requestScope.workspaceId === scope.workspaceId && connectionId === connection.id
        ? 'fixture-provider-token'
        : null;
    },
  } as unknown as GitHubConnectionStore;
}

function providerClient(releaseName: string): GitHubProviderClient {
  return {
    async validateCredential() { throw new Error('not_used'); },
    async getRepository() { throw new Error('not_used'); },
    async getLatestCommit() { throw new Error('not_used'); },
    async listPullRequests() { return []; },
    async listIssues() { return []; },
    async listWorkflowRuns() { return []; },
    async listReleases() {
      return [{
        id: 'release-1',
        tagName: 'v1.0.0',
        name: releaseName,
        draft: false,
        prerelease: false,
        targetCommitish: 'main',
        htmlUrl: 'https://github.com/Emmakex/Kairoseth-Command-Center/releases/tag/v1.0.0',
        createdAt: '2026-10-15T06:00:00Z',
        publishedAt: '2026-10-15T06:10:00Z',
      }];
    },
  };
}

const headers = { authorization: 'Bearer valid-token' };

describe('integration signal history', () => {
  it('persists a live refresh idempotently and exposes provider-neutral history', async () => {
    const signalStore = new MemoryIntegrationSignalStore();
    const app = buildApp({
      authProvider,
      integrationSignalStore: signalStore,
      githubRepositoryStore: repositoryStore(),
      githubConnectionStore: connectionStore(),
      githubProviderClient: providerClient('Initial release'),
    });

    const refresh = await app.inject({
      method: 'GET',
      url: '/v1/integrations/github/repositories/resource-1/signals?limit=10',
      headers,
    });
    expect(refresh.statusCode).toBe(200);
    expect(signalStore.signals.size).toBe(1);

    const history = await app.inject({
      method: 'GET',
      url: '/v1/integrations/signals?resourceId=resource-1&projectId=project-a&type=repository.release&limit=10',
      headers,
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().signals).toMatchObject([
      {
        id: 'github:release:release-1',
        source: 'github',
        type: 'repository.release',
        workspaceId: 'workspace-a',
        payload: {
          resourceId: 'resource-1',
          projectId: 'project-a',
          name: 'Initial release',
        },
      },
    ]);
    await app.close();
  });

  it('derives the history workspace from the session and never returns another workspace', async () => {
    const signalStore = new MemoryIntegrationSignalStore();
    await signalStore.upsertSignals('workspace-a', [{
      id: 'github:issue:1',
      source: 'github',
      type: 'repository.issue',
      workspaceId: 'workspace-a',
      occurredAt: '2026-10-15T06:00:00Z',
      payload: { resourceId: 'resource-1' },
    }]);
    await signalStore.upsertSignals('workspace-b', [{
      id: 'github:issue:2',
      source: 'github',
      type: 'repository.issue',
      workspaceId: 'workspace-b',
      occurredAt: '2026-10-15T07:00:00Z',
      payload: { resourceId: 'resource-1' },
    }]);
    const app = buildApp({ authProvider, integrationSignalStore: signalStore });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/integrations/signals?resourceId=resource-1',
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().signals).toHaveLength(1);
    expect(response.json().signals[0].workspaceId).toBe('workspace-a');
    expect(response.body).not.toContain('github:issue:2');
    await app.close();
  });

  it('rejects unsupported signal types before reading persistence', async () => {
    const signalStore = new MemoryIntegrationSignalStore();
    const app = buildApp({ authProvider, integrationSignalStore: signalStore });
    const response = await app.inject({
      method: 'GET',
      url: '/v1/integrations/signals?type=repository.unknown',
      headers,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_signal_type' });
    await app.close();
  });

  it('requires projects.read for durable history', async () => {
    const restrictedProvider: AuthProvider = {
      name: 'restricted',
      async resolveSession() {
        return { ...memberSession, capabilities: [] };
      },
    };
    const app = buildApp({
      authProvider: restrictedProvider,
      integrationSignalStore: new MemoryIntegrationSignalStore(),
    });
    const response = await app.inject({
      method: 'GET',
      url: '/v1/integrations/signals',
      headers,
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});
