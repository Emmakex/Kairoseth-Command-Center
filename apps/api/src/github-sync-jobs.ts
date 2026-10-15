import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize } from '@kcc/auth';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { Scope } from '@kcc/domain';
import type { IntegrationSyncJobStore } from '@kcc/persistence/integration-sync-jobs';
import type { GitHubConnectionStore } from './github-connection-store';
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

export function registerGitHubSyncJobRoutes(
  app: FastifyInstance,
  options: {
    authProvider?: AuthProvider;
    githubRepositoryStore?: GitHubRepositoryStore;
    githubConnectionStore?: GitHubConnectionStore;
    integrationSyncJobStore?: IntegrationSyncJobStore;
  },
): void {
  app.post('/v1/integrations/github/repositories/:resourceId/refresh', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.githubRepositoryStore || !options.githubConnectionStore || !options.integrationSyncJobStore) {
      return reply.code(503).send({ error: 'github_background_refresh_unavailable' });
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

    const job = await options.integrationSyncJobStore.enqueue({
      workspaceId: scope.workspaceId,
      provider: 'github',
      kind: 'repository_signals',
      resourceId: resource.id,
      dedupeKey: `github:repository_signals:${resource.id}`,
      maxAttempts: 8,
    });

    return reply.code(202).send({
      job: {
        id: job.id,
        provider: job.provider,
        kind: job.kind,
        resourceId: job.resourceId,
        status: job.status,
        attempt: job.attempt,
        maxAttempts: job.maxAttempts,
        availableAt: job.availableAt,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
    });
  });
}
