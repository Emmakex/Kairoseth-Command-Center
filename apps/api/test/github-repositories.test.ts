import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { ExternalResource, Scope } from '@kcc/domain';
import { buildApp } from '../src/application';
import type {
  CreateGitHubRepositoryLinkInput,
  GitHubRepositoryStore,
} from '../src/github-repository-store';

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
  capabilities: ['integrations.manage', 'projects.read', 'projects.write'],
  productEntitlements: ['command-center'],
};

const memberSession: SessionContext = {
  ...adminSession,
  user: { ...adminSession.user, id: 'user-member', email: 'member@example.com' },
  membershipId: 'membership-member',
  role: 'member',
  capabilities: ['projects.read'],
};

function provider(session: SessionContext): AuthProvider {
  return {
    name: 'test',
    async resolveSession(input) {
      return input.authorization === 'Bearer valid-token' ? session : null;
    },
  };
}

function sameScope(left: WorkspaceScope, right: WorkspaceScope): boolean {
  return left.kind === right.kind && left.workspaceId === right.workspaceId;
}

class MemoryGitHubRepositoryStore implements GitHubRepositoryStore {
  resources: ExternalResource[] = [];
  validProjects = new Set(['workspace-a:project-a', 'workspace-b:project-b']);

  async ensureIndexes() {}

  async createRepositoryLink(
    input: CreateGitHubRepositoryLinkInput,
  ): Promise<ExternalResource | null> {
    if (!this.validProjects.has(`${input.scope.workspaceId}:${input.projectId}`)) return null;
    if (
      this.resources.some(
        (resource) =>
          sameScope(resource.scope, input.scope) &&
          resource.provider === 'github' &&
          resource.kind === 'repository' &&
          resource.externalId === input.externalId,
      )
    ) {
      const error = new Error('duplicate') as Error & { code: number };
      error.code = 11000;
      throw error;
    }

    const now = '2026-10-14T18:00:00.000Z';
    const resource: ExternalResource = {
      id: `resource-${this.resources.length + 1}`,
      scope: input.scope,
      provider: 'github',
      kind: 'repository',
      externalId: input.externalId,
      displayName: `${input.owner}/${input.repository}`,
      url: input.url,
      projectId: input.projectId,
      metadata: {
        owner: input.owner,
        repository: input.repository,
        ...(input.defaultBranch ? { defaultBranch: input.defaultBranch } : {}),
      },
      createdAt: now,
      updatedAt: now,
    };
    this.resources.push(resource);
    return resource;
  }

  async listRepositoryLinks(
    scope: WorkspaceScope,
    projectId?: string,
  ): Promise<ExternalResource[]> {
    return this.resources.filter(
      (resource) =>
        sameScope(resource.scope, scope) &&
        resource.provider === 'github' &&
        resource.kind === 'repository' &&
        (!projectId || resource.projectId === projectId),
    );
  }

  async deleteRepositoryLink(
    scope: WorkspaceScope,
    _actorUserId: string,
    resourceId: string,
  ): Promise<ExternalResource | null> {
    const index = this.resources.findIndex(
      (resource) =>
        resource.id === resourceId &&
        sameScope(resource.scope, scope) &&
        resource.provider === 'github' &&
        resource.kind === 'repository',
    );
    if (index < 0) return null;
    return this.resources.splice(index, 1)[0] ?? null;
  }
}

const authHeaders = { authorization: 'Bearer valid-token' };

describe('GitHub repository links API', () => {
  it('derives workspace scope and constructs the GitHub URL server-side', async () => {
    const store = new MemoryGitHubRepositoryStore();
    const app = buildApp({
      authProvider: provider(adminSession),
      githubRepositoryStore: store,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/integrations/github/repositories',
      headers: authHeaders,
      payload: {
        workspaceId: 'workspace-b',
        projectId: 'project-a',
        owner: 'Emmakex',
        repository: 'Kairoseth-Command-Center',
        defaultBranch: 'main',
        url: 'https://attacker.invalid/ignored',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().repository).toMatchObject({
      scope: { kind: 'workspace', workspaceId: 'workspace-a' },
      externalId: 'emmakex/kairoseth-command-center',
      displayName: 'Emmakex/Kairoseth-Command-Center',
      url: 'https://github.com/Emmakex/Kairoseth-Command-Center',
      projectId: 'project-a',
      metadata: {
        owner: 'Emmakex',
        repository: 'Kairoseth-Command-Center',
        defaultBranch: 'main',
      },
    });
    expect(JSON.stringify(store.resources[0])).not.toContain('attacker.invalid');
    await app.close();
  });

  it('rejects a project that does not belong to the authenticated workspace', async () => {
    const store = new MemoryGitHubRepositoryStore();
    const app = buildApp({
      authProvider: provider(adminSession),
      githubRepositoryStore: store,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/integrations/github/repositories',
      headers: authHeaders,
      payload: {
        projectId: 'project-b',
        owner: 'Emmakex',
        repository: 'foreign-project-repo',
      },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'project_not_found' });
    expect(store.resources).toHaveLength(0);
    await app.close();
  });

  it('requires integrations.manage for list, create and delete', async () => {
    const store = new MemoryGitHubRepositoryStore();
    const app = buildApp({
      authProvider: provider(memberSession),
      githubRepositoryStore: store,
    });

    const listed = await app.inject({
      method: 'GET',
      url: '/v1/integrations/github/repositories',
      headers: authHeaders,
    });
    expect(listed.statusCode).toBe(403);

    const created = await app.inject({
      method: 'POST',
      url: '/v1/integrations/github/repositories',
      headers: authHeaders,
      payload: { projectId: 'project-a', owner: 'Emmakex', repository: 'blocked' },
    });
    expect(created.statusCode).toBe(403);

    const deleted = await app.inject({
      method: 'DELETE',
      url: '/v1/integrations/github/repositories/resource-1',
      headers: authHeaders,
    });
    expect(deleted.statusCode).toBe(403);
    await app.close();
  });

  it('canonicalizes duplicates per workspace and returns conflict', async () => {
    const store = new MemoryGitHubRepositoryStore();
    const app = buildApp({
      authProvider: provider(adminSession),
      githubRepositoryStore: store,
    });

    const first = await app.inject({
      method: 'POST',
      url: '/v1/integrations/github/repositories',
      headers: authHeaders,
      payload: { projectId: 'project-a', owner: 'Emmakex', repository: 'Example.Repo' },
    });
    expect(first.statusCode).toBe(201);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/v1/integrations/github/repositories',
      headers: authHeaders,
      payload: { projectId: 'project-a', owner: 'emmakex', repository: 'example.repo' },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ error: 'github_repository_already_linked' });
    await app.close();
  });

  it('lists by project and unlinks only inside the authenticated workspace', async () => {
    const store = new MemoryGitHubRepositoryStore();
    const workspaceA: WorkspaceScope = { kind: 'workspace', workspaceId: 'workspace-a' };
    const workspaceB: WorkspaceScope = { kind: 'workspace', workspaceId: 'workspace-b' };
    await store.createRepositoryLink({
      scope: workspaceA,
      actorUserId: 'user-admin',
      projectId: 'project-a',
      owner: 'Emmakex',
      repository: 'one',
      externalId: 'emmakex/one',
      url: 'https://github.com/Emmakex/one',
    });
    await store.createRepositoryLink({
      scope: workspaceB,
      actorUserId: 'foreign-admin',
      projectId: 'project-b',
      owner: 'Other',
      repository: 'two',
      externalId: 'other/two',
      url: 'https://github.com/Other/two',
    });

    const app = buildApp({
      authProvider: provider(adminSession),
      githubRepositoryStore: store,
    });
    const listed = await app.inject({
      method: 'GET',
      url: '/v1/integrations/github/repositories?projectId=project-a',
      headers: authHeaders,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().repositories).toHaveLength(1);
    expect(listed.json().repositories[0].externalId).toBe('emmakex/one');

    const foreignDelete = await app.inject({
      method: 'DELETE',
      url: '/v1/integrations/github/repositories/resource-2',
      headers: authHeaders,
    });
    expect(foreignDelete.statusCode).toBe(404);

    const ownDelete = await app.inject({
      method: 'DELETE',
      url: '/v1/integrations/github/repositories/resource-1',
      headers: authHeaders,
    });
    expect(ownDelete.statusCode).toBe(200);
    expect(ownDelete.json().repository.externalId).toBe('emmakex/one');
    await app.close();
  });

  it('rejects path-like GitHub owner/repository input', async () => {
    const store = new MemoryGitHubRepositoryStore();
    const app = buildApp({
      authProvider: provider(adminSession),
      githubRepositoryStore: store,
    });

    const invalidOwner = await app.inject({
      method: 'POST',
      url: '/v1/integrations/github/repositories',
      headers: authHeaders,
      payload: { projectId: 'project-a', owner: 'Emmakex/other', repository: 'repo' },
    });
    expect(invalidOwner.statusCode).toBe(400);
    expect(invalidOwner.json()).toEqual({ error: 'invalid_github_owner' });

    const invalidRepository = await app.inject({
      method: 'POST',
      url: '/v1/integrations/github/repositories',
      headers: authHeaders,
      payload: { projectId: 'project-a', owner: 'Emmakex', repository: '../repo' },
    });
    expect(invalidRepository.statusCode).toBe(400);
    expect(invalidRepository.json()).toEqual({ error: 'invalid_github_repository' });
    await app.close();
  });
});
