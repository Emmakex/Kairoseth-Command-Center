import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { ExternalResource, IntegrationConnection, Scope } from '@kcc/domain';
import { buildApp } from '../src/application';
import type { GitHubConnectionStore } from '../src/github-connection-store';
import type { GitHubRepositoryStore } from '../src/github-repository-store';
import type {
  EnqueueIntegrationSyncJobInput,
  IntegrationSyncJob,
  IntegrationSyncJobStore,
} from '@kcc/persistence/integration-sync-jobs';

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

const headers = { authorization: 'Bearer valid-token' };
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
  createdAt: '2026-10-15T08:00:00.000Z',
  updatedAt: '2026-10-15T08:00:00.000Z',
};

const activeConnection: IntegrationConnection = {
  id: 'connection-1',
  scope,
  provider: 'github',
  displayName: 'Primary GitHub',
  status: 'active',
  secretRef: 'secret-1',
  lastValidatedAt: '2026-10-15T08:00:00.000Z',
  createdAt: '2026-10-15T08:00:00.000Z',
  updatedAt: '2026-10-15T08:00:00.000Z',
};

function authProvider(session: SessionContext = adminSession): AuthProvider {
  return {
    name: 'test',
    async resolveSession(input) {
      return input.authorization === 'Bearer valid-token' ? session : null;
    },
  };
}

function repositoryStore(): GitHubRepositoryStore {
  return {
    async getRepositoryLink(requestScope: WorkspaceScope, resourceId: string) {
      return requestScope.workspaceId === scope.workspaceId && resourceId === resource.id
        ? resource
        : null;
    },
  } as unknown as GitHubRepositoryStore;
}

function connectionStore(connection: IntegrationConnection = activeConnection): GitHubConnectionStore {
  return {
    async getConnection(requestScope: WorkspaceScope, connectionId: string) {
      return requestScope.workspaceId === scope.workspaceId && connectionId === connection.id
        ? connection
        : null;
    },
  } as unknown as GitHubConnectionStore;
}

class MemorySyncJobStore implements IntegrationSyncJobStore {
  lastInput?: EnqueueIntegrationSyncJobInput;
  private job?: IntegrationSyncJob;

  async ensureIndexes(): Promise<void> {}

  async enqueue(input: EnqueueIntegrationSyncJobInput): Promise<IntegrationSyncJob> {
    this.lastInput = input;
    if (this.job) return this.job;
    this.job = {
      id: 'job-1',
      workspaceId: input.workspaceId,
      provider: input.provider,
      kind: input.kind,
      resourceId: input.resourceId,
      dedupeKey: input.dedupeKey,
      activeDedupeKey: input.dedupeKey,
      status: 'pending',
      attempt: 0,
      maxAttempts: input.maxAttempts ?? 8,
      availableAt: '2026-10-15T08:10:00.000Z',
      createdAt: '2026-10-15T08:10:00.000Z',
      updatedAt: '2026-10-15T08:10:00.000Z',
    };
    return this.job;
  }

  async claimDue() { return null; }
  async complete() { return false; }
  async fail() { return false; }
  async retry() { return null; }
  async requeueExpired() { return 0; }
}

describe('GitHub background refresh enqueue API', () => {
  it('derives workspace server-side, deduplicates active work and returns only safe job metadata', async () => {
    const jobs = new MemorySyncJobStore();
    const app = buildApp({
      authProvider: authProvider(),
      githubRepositoryStore: repositoryStore(),
      githubConnectionStore: connectionStore(),
      integrationSyncJobStore: jobs,
    });

    const first = await app.inject({
      method: 'POST',
      url: '/v1/integrations/github/repositories/resource-1/refresh',
      headers,
      payload: { workspaceId: 'workspace-attacker', token: 'should-never-be-read' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/v1/integrations/github/repositories/resource-1/refresh',
      headers,
    });

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    expect(first.json().job.id).toBe('job-1');
    expect(second.json().job.id).toBe('job-1');
    expect(jobs.lastInput).toEqual({
      workspaceId: 'workspace-a',
      provider: 'github',
      kind: 'repository_signals',
      resourceId: 'resource-1',
      dedupeKey: 'github:repository_signals:resource-1',
      maxAttempts: 8,
    });
    expect(first.body).not.toContain('workspace-attacker');
    expect(first.body).not.toContain('should-never-be-read');
    expect(first.body).not.toContain('dedupeKey');
    expect(first.body).not.toContain('activeDedupeKey');
    expect(first.body).not.toContain('claimToken');
    await app.close();
  });

  it('requires integrations.manage', async () => {
    const app = buildApp({
      authProvider: authProvider({
        ...adminSession,
        role: 'member',
        capabilities: ['projects.read'],
      }),
      githubRepositoryStore: repositoryStore(),
      githubConnectionStore: connectionStore(),
      integrationSyncJobStore: new MemorySyncJobStore(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/integrations/github/repositories/resource-1/refresh',
      headers,
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('refuses to enqueue work for an unvalidated connection', async () => {
    const app = buildApp({
      authProvider: authProvider(),
      githubRepositoryStore: repositoryStore(),
      githubConnectionStore: connectionStore({
        ...activeConnection,
        status: 'unverified',
        lastValidatedAt: undefined,
      }),
      integrationSyncJobStore: new MemorySyncJobStore(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/integrations/github/repositories/resource-1/refresh',
      headers,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'github_connection_not_validated' });
    await app.close();
  });
});
