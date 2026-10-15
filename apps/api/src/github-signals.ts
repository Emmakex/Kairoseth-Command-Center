import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize } from '@kcc/auth';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { Scope } from '@kcc/domain';
import { executeGitHubRepositorySignals } from '@kcc/integrations/github-signal-executor';
import type { IntegrationSignalStore } from '@kcc/persistence/integration-signals';
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

function canReadSignals(session: SessionContext, scope: WorkspaceScope): boolean {
  return authorize(session, {
    scope,
    capability: 'projects.read',
    product: 'command-center',
  });
}

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function signalLimit(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return 20;
  const parsed = typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) return null;
  return parsed;
}

function repositoryCoordinates(metadata: Record<string, unknown>): {
  owner: string;
  repository: string;
} | null {
  const owner = text(metadata.owner, 100);
  const repository = text(metadata.repository, 100);
  return owner && repository ? { owner, repository } : null;
}

function providerHttpError(error: GitHubProviderError): { status: number; error: string } {
  switch (error.code) {
    case 'unauthorized':
      return { status: 422, error: 'github_connection_invalid_credential' };
    case 'forbidden':
    case 'not_found':
      return { status: 422, error: 'github_repository_signals_not_accessible' };
    case 'rate_limited':
      return { status: 429, error: 'github_rate_limited' };
    case 'timeout':
    case 'upstream_error':
      return { status: 502, error: 'github_upstream_unavailable' };
  }
}

export function registerGitHubSignalRoutes(
  app: FastifyInstance,
  options: {
    authProvider?: AuthProvider;
    githubRepositoryStore?: GitHubRepositoryStore;
    githubConnectionStore?: GitHubConnectionStore;
    githubProviderClient?: GitHubProviderClient;
    integrationSignalStore?: IntegrationSignalStore;
  },
): void {
  app.get('/v1/integrations/github/repositories/:resourceId/signals', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.githubRepositoryStore || !options.githubConnectionStore || !options.githubProviderClient) {
      return reply.code(503).send({ error: 'github_signals_unavailable' });
    }

    const scope = workspaceScope(session);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canReadSignals(session, scope)) return reply.code(403).send({ error: 'forbidden' });

    const params = request.params as { resourceId?: unknown };
    const query = request.query as { limit?: unknown };
    const resourceId = text(params.resourceId, 100);
    const limit = signalLimit(query.limit);
    if (!resourceId) return reply.code(400).send({ error: 'invalid_resource_id' });
    if (!limit) return reply.code(400).send({ error: 'invalid_limit' });

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

    const token = await options.githubConnectionStore.resolveCredential(scope, connection.id, {
      requireActive: true,
    });
    if (!token) return reply.code(409).send({ error: 'github_connection_credential_unavailable' });

    const coordinates = repositoryCoordinates(resource.metadata);
    if (!coordinates) return reply.code(409).send({ error: 'github_repository_metadata_invalid' });

    try {
      const signals = await executeGitHubRepositorySignals({
        providerClient: options.githubProviderClient,
        token,
        workspaceId: scope.workspaceId,
        resourceId: resource.id,
        ...(resource.projectId ? { projectId: resource.projectId } : {}),
        owner: coordinates.owner,
        repository: coordinates.repository,
        limit,
      });

      if (options.integrationSignalStore) {
        await options.integrationSignalStore.upsertSignals(scope.workspaceId, signals);
      }
      return { signals: signals.slice(0, limit) };
    } catch (error) {
      if (!(error instanceof GitHubProviderError)) throw error;
      if (error.code === 'unauthorized') {
        await options.githubConnectionStore.markValidationFailure(
          scope,
          session.user.id,
          connection.id,
          error.code,
        );
      }
      const mapped = providerHttpError(error);
      return reply.code(mapped.status).send({ error: mapped.error });
    }
  });
}
