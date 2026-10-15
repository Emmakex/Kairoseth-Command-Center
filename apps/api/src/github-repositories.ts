import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize } from '@kcc/auth';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { ExternalResource, Scope } from '@kcc/domain';
import type { GitHubConnectionStore } from './github-connection-store';
import { GitHubProviderError } from './github-provider-client';
import type { GitHubProviderClient } from './github-provider-client';
import type { GitHubRepositoryStore } from './github-repository-store';

type WorkspaceScope = Extract<Scope, { kind: 'workspace' }>;

async function resolveSession(
  request: FastifyRequest,
  authProvider?: AuthProvider,
): Promise<SessionContext | null> {
  if (!authProvider) return null;
  const authorization = request.headers.authorization;
  const cookie = request.headers.cookie;
  return authProvider.resolveSession({
    ...(authorization ? { authorization } : {}),
    ...(cookie ? { cookie } : {}),
  });
}

function workspaceScope(session: SessionContext): WorkspaceScope | null {
  return session.activeWorkspaceId
    ? { kind: 'workspace', workspaceId: session.activeWorkspaceId }
    : null;
}

function canManageIntegrations(session: SessionContext, scope: WorkspaceScope): boolean {
  return authorize(session, {
    scope,
    capability: 'integrations.manage',
    product: 'command-center',
  });
}

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function optionalText(value: unknown, maxLength: number): string | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  return text(value, maxLength);
}

function githubOwner(value: unknown): string | null {
  const normalized = text(value, 100);
  if (!normalized) return null;
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(normalized) ? normalized : null;
}

function githubRepository(value: unknown): string | null {
  const normalized = text(value, 100);
  if (!normalized || normalized === '.' || normalized === '..') return null;
  return /^[A-Za-z0-9._-]+$/.test(normalized) ? normalized : null;
}

function duplicateKey(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000,
  );
}

function repositoryCoordinates(resource: ExternalResource): { owner: string; repository: string } | null {
  const owner = githubOwner(resource.metadata.owner);
  const repository = githubRepository(resource.metadata.repository);
  return owner && repository ? { owner, repository } : null;
}

function syncHttpError(error: GitHubProviderError): { status: number; error: string } {
  switch (error.code) {
    case 'unauthorized':
      return { status: 422, error: 'github_connection_invalid_credential' };
    case 'forbidden':
    case 'not_found':
      return { status: 422, error: 'github_repository_not_accessible' };
    case 'rate_limited':
      return { status: 429, error: 'github_rate_limited' };
    case 'timeout':
    case 'upstream_error':
      return { status: 502, error: 'github_upstream_unavailable' };
  }
}

export function registerGitHubRepositoryRoutes(
  app: FastifyInstance,
  options: {
    authProvider?: AuthProvider;
    githubRepositoryStore?: GitHubRepositoryStore;
    githubConnectionStore?: GitHubConnectionStore;
    githubProviderClient?: GitHubProviderClient;
  },
): void {
  app.get('/v1/integrations/github/repositories', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.githubRepositoryStore) {
      return reply.code(503).send({ error: 'github_repository_store_unavailable' });
    }

    const scope = workspaceScope(session);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canManageIntegrations(session, scope)) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const query = request.query as { projectId?: unknown };
    const projectId = optionalText(query.projectId, 100);
    if (projectId === null) return reply.code(400).send({ error: 'invalid_project_id' });

    return {
      repositories: await options.githubRepositoryStore.listRepositoryLinks(scope, projectId),
    };
  });

  app.post('/v1/integrations/github/repositories', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.githubRepositoryStore) {
      return reply.code(503).send({ error: 'github_repository_store_unavailable' });
    }

    const scope = workspaceScope(session);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canManageIntegrations(session, scope)) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const projectId = text(body.projectId, 100);
    const owner = githubOwner(body.owner);
    const repository = githubRepository(body.repository);
    const defaultBranch = optionalText(body.defaultBranch, 255);
    if (!projectId) return reply.code(400).send({ error: 'invalid_project_id' });
    if (!owner) return reply.code(400).send({ error: 'invalid_github_owner' });
    if (!repository) return reply.code(400).send({ error: 'invalid_github_repository' });
    if (defaultBranch === null) return reply.code(400).send({ error: 'invalid_default_branch' });

    const externalId = `${owner.toLowerCase()}/${repository.toLowerCase()}`;
    const url = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;

    try {
      const resource = await options.githubRepositoryStore.createRepositoryLink({
        scope,
        actorUserId: session.user.id,
        projectId,
        owner,
        repository,
        externalId,
        url,
        ...(defaultBranch ? { defaultBranch } : {}),
      });
      if (!resource) return reply.code(404).send({ error: 'project_not_found' });
      return reply.code(201).send({ repository: resource });
    } catch (error) {
      if (duplicateKey(error)) return reply.code(409).send({ error: 'github_repository_already_linked' });
      throw error;
    }
  });

  app.patch('/v1/integrations/github/repositories/:resourceId/connection', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.githubRepositoryStore) {
      return reply.code(503).send({ error: 'github_repository_store_unavailable' });
    }
    const scope = workspaceScope(session);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canManageIntegrations(session, scope)) return reply.code(403).send({ error: 'forbidden' });

    const params = request.params as { resourceId?: unknown };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const resourceId = text(params.resourceId, 100);
    const connectionId = text(body.connectionId, 100);
    if (!resourceId) return reply.code(400).send({ error: 'invalid_resource_id' });
    if (!connectionId) return reply.code(400).send({ error: 'invalid_connection_id' });

    const result = await options.githubRepositoryStore.bindConnection(
      scope,
      session.user.id,
      resourceId,
      connectionId,
    );
    if (result.status === 'repository_not_found') {
      return reply.code(404).send({ error: 'github_repository_not_found' });
    }
    if (result.status === 'connection_not_found') {
      return reply.code(404).send({ error: 'github_connection_not_found' });
    }
    if (result.status === 'connection_not_validated') {
      return reply.code(409).send({ error: 'github_connection_not_validated' });
    }
    return { repository: result.resource };
  });

  app.post('/v1/integrations/github/repositories/:resourceId/sync', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.githubRepositoryStore || !options.githubConnectionStore || !options.githubProviderClient) {
      return reply.code(503).send({ error: 'github_sync_unavailable' });
    }
    const scope = workspaceScope(session);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canManageIntegrations(session, scope)) return reply.code(403).send({ error: 'forbidden' });

    const params = request.params as { resourceId?: unknown };
    const resourceId = text(params.resourceId, 100);
    if (!resourceId) return reply.code(400).send({ error: 'invalid_resource_id' });
    const resource = await options.githubRepositoryStore.getRepositoryLink(scope, resourceId);
    if (!resource) return reply.code(404).send({ error: 'github_repository_not_found' });
    if (!resource.connectionId) {
      return reply.code(409).send({ error: 'github_repository_connection_required' });
    }
    const connection = await options.githubConnectionStore.getConnection(scope, resource.connectionId);
    if (!connection) return reply.code(404).send({ error: 'github_connection_not_found' });
    if (connection.status !== 'active' || !connection.lastValidatedAt) {
      return reply.code(409).send({ error: 'github_connection_not_validated' });
    }
    const token = await options.githubConnectionStore.resolveCredential(
      scope,
      connection.id,
      { requireActive: true },
    );
    if (!token) return reply.code(409).send({ error: 'github_connection_credential_unavailable' });
    const coordinates = repositoryCoordinates(resource);
    if (!coordinates) return reply.code(409).send({ error: 'github_repository_metadata_invalid' });

    try {
      const remote = await options.githubProviderClient.getRepository(
        token,
        coordinates.owner,
        coordinates.repository,
      );
      const commit = await options.githubProviderClient.getLatestCommit(
        token,
        coordinates.owner,
        coordinates.repository,
        remote.defaultBranch,
      );
      const syncedAt = new Date().toISOString();
      const updated = await options.githubRepositoryStore.applySyncResult({
        scope,
        actorUserId: session.user.id,
        resourceId,
        connectionId: connection.id,
        githubRepositoryId: remote.id,
        remoteFullName: remote.fullName,
        defaultBranch: remote.defaultBranch,
        latestCommitSha: commit.sha,
        private: remote.private,
        archived: remote.archived,
        syncedAt,
        ...(commit.htmlUrl ? { latestCommitUrl: commit.htmlUrl } : {}),
        ...(commit.committedAt ? { latestCommitAt: commit.committedAt } : {}),
        ...(remote.updatedAt ? { remoteUpdatedAt: remote.updatedAt } : {}),
      });
      if (!updated) return reply.code(409).send({ error: 'github_repository_binding_changed' });
      return { repository: updated };
    } catch (error) {
      if (!(error instanceof GitHubProviderError)) throw error;
      await options.githubRepositoryStore.recordSyncFailure(
        scope,
        session.user.id,
        resourceId,
        error.code,
      );
      if (error.code === 'unauthorized') {
        await options.githubConnectionStore.markValidationFailure(
          scope,
          session.user.id,
          connection.id,
          error.code,
        );
      }
      const mapped = syncHttpError(error);
      return reply.code(mapped.status).send({ error: mapped.error });
    }
  });

  app.delete('/v1/integrations/github/repositories/:resourceId', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.githubRepositoryStore) {
      return reply.code(503).send({ error: 'github_repository_store_unavailable' });
    }

    const scope = workspaceScope(session);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canManageIntegrations(session, scope)) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const params = request.params as { resourceId?: unknown };
    const resourceId = text(params.resourceId, 100);
    if (!resourceId) return reply.code(400).send({ error: 'invalid_resource_id' });

    const resource = await options.githubRepositoryStore.deleteRepositoryLink(
      scope,
      session.user.id,
      resourceId,
    );
    if (!resource) return reply.code(404).send({ error: 'github_repository_not_found' });
    return { repository: resource };
  });
}
