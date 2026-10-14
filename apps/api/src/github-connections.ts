import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize } from '@kcc/auth';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { IntegrationConnection, Scope } from '@kcc/domain';
import type { GitHubConnectionStore } from './github-connection-store';

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

function nonEmptyString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function validToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (normalized.length < 20 || normalized.length > 2048) return null;
  if (/\s/.test(normalized)) return null;
  return normalized;
}

function publicConnection(connection: IntegrationConnection) {
  return {
    id: connection.id,
    provider: connection.provider,
    displayName: connection.displayName,
    status: connection.status,
    credentialConfigured: Boolean(connection.secretRef),
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

export function registerGitHubConnectionRoutes(
  app: FastifyInstance,
  options: { authProvider?: AuthProvider; githubConnectionStore?: GitHubConnectionStore },
): void {
  app.get('/v1/integrations/github/connections', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const scope = workspaceScope(session);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canManageIntegrations(session, scope)) return reply.code(403).send({ error: 'forbidden' });
    if (!options.githubConnectionStore) {
      return reply.code(503).send({ error: 'github_connection_store_unavailable' });
    }

    const connections = await options.githubConnectionStore.listConnections(scope);
    return { connections: connections.map(publicConnection) };
  });

  app.post('/v1/integrations/github/connections', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const scope = workspaceScope(session);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canManageIntegrations(session, scope)) return reply.code(403).send({ error: 'forbidden' });
    if (!options.githubConnectionStore) {
      return reply.code(503).send({ error: 'github_connection_store_unavailable' });
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const displayName = nonEmptyString(body.displayName, 160);
    const token = validToken(body.token);
    if (!displayName) return reply.code(400).send({ error: 'invalid_display_name' });
    if (!token) return reply.code(400).send({ error: 'invalid_token' });

    const connection = await options.githubConnectionStore.createConnection({
      scope,
      actorUserId: session.user.id,
      displayName,
      token,
    });
    return reply.code(201).send({ connection: publicConnection(connection) });
  });

  app.patch('/v1/integrations/github/connections/:id/credential', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const scope = workspaceScope(session);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canManageIntegrations(session, scope)) return reply.code(403).send({ error: 'forbidden' });
    if (!options.githubConnectionStore) {
      return reply.code(503).send({ error: 'github_connection_store_unavailable' });
    }

    const params = request.params as { id?: string };
    const connectionId = nonEmptyString(params.id, 100);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const token = validToken(body.token);
    if (!connectionId) return reply.code(400).send({ error: 'invalid_connection_id' });
    if (!token) return reply.code(400).send({ error: 'invalid_token' });

    const connection = await options.githubConnectionStore.rotateCredential(
      scope,
      session.user.id,
      connectionId,
      token,
    );
    if (!connection) return reply.code(404).send({ error: 'github_connection_not_found' });
    return { connection: publicConnection(connection) };
  });

  app.delete('/v1/integrations/github/connections/:id', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const scope = workspaceScope(session);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canManageIntegrations(session, scope)) return reply.code(403).send({ error: 'forbidden' });
    if (!options.githubConnectionStore) {
      return reply.code(503).send({ error: 'github_connection_store_unavailable' });
    }

    const params = request.params as { id?: string };
    const connectionId = nonEmptyString(params.id, 100);
    if (!connectionId) return reply.code(400).send({ error: 'invalid_connection_id' });

    const result = await options.githubConnectionStore.deleteConnection(
      scope,
      session.user.id,
      connectionId,
    );
    if (result.status === 'not_found') {
      return reply.code(404).send({ error: 'github_connection_not_found' });
    }
    if (result.status === 'in_use') {
      return reply.code(409).send({ error: 'github_connection_in_use' });
    }
    return { connection: publicConnection(result.connection) };
  });
}
