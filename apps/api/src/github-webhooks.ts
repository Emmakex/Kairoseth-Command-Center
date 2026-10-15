import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize } from '@kcc/auth';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { Scope } from '@kcc/domain';
import {
  githubWebhookTriggersRepositoryRefresh,
  verifyGitHubWebhook,
} from '@kcc/integrations/github-webhook';
import type { GitHubWebhookStore } from '@kcc/persistence/github-webhooks';
import type { IntegrationSyncJobStore } from '@kcc/persistence/integration-sync-jobs';
import type { GitHubConnectionStore } from './github-connection-store';

type WorkspaceScope = Extract<Scope, { kind: 'workspace' }>;

type WebhookRouteOptions = {
  authProvider?: AuthProvider;
  githubConnectionStore?: GitHubConnectionStore;
  githubWebhookStore?: GitHubWebhookStore;
  integrationSyncJobStore?: IntegrationSyncJobStore;
};

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

function endpointResponse(endpoint: { id: string; connectionId: string; enabled: boolean; createdAt: string; updatedAt: string }) {
  return {
    id: endpoint.id,
    connectionId: endpoint.connectionId,
    enabled: endpoint.enabled,
    path: `/v1/integrations/github/webhooks/${endpoint.id}`,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  };
}

function repositoryFullName(rawBody: Buffer): string | null {
  try {
    const payload = JSON.parse(rawBody.toString('utf8')) as unknown;
    if (!payload || typeof payload !== 'object') return null;
    const repository = (payload as { repository?: unknown }).repository;
    if (!repository || typeof repository !== 'object') return null;
    const fullName = (repository as { full_name?: unknown }).full_name;
    return nonEmptyString(fullName, 300)?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

async function manageableWebhook(
  request: FastifyRequest,
  options: WebhookRouteOptions,
): Promise<
  | { ok: true; scope: WorkspaceScope; actorUserId: string; connectionId: string }
  | { ok: false; status: number; error: string }
> {
  const session = await resolveSession(request, options.authProvider);
  if (!session) return { ok: false, status: 401, error: 'unauthorized' };
  const scope = workspaceScope(session);
  if (!scope) return { ok: false, status: 400, error: 'workspace_required' };
  if (!canManageIntegrations(session, scope)) {
    return { ok: false, status: 403, error: 'forbidden' };
  }
  if (!options.githubWebhookStore) {
    return { ok: false, status: 503, error: 'github_webhook_store_unavailable' };
  }

  const params = request.params as { id?: string };
  const connectionId = nonEmptyString(params.id, 100);
  if (!connectionId) return { ok: false, status: 400, error: 'invalid_connection_id' };
  return { ok: true, scope, actorUserId: session.user.id, connectionId };
}

export function registerGitHubWebhookRoutes(app: FastifyInstance, options: WebhookRouteOptions): void {
  app.get('/v1/integrations/github/connections/:id/webhook', async (request, reply) => {
    const context = await manageableWebhook(request, options);
    if (!context.ok) return reply.code(context.status).send({ error: context.error });
    const endpoint = await options.githubWebhookStore!.get(context.scope, context.connectionId);
    if (!endpoint) return reply.code(404).send({ error: 'github_webhook_not_configured' });
    return { webhook: endpointResponse(endpoint) };
  });

  app.post('/v1/integrations/github/connections/:id/webhook', async (request, reply) => {
    const context = await manageableWebhook(request, options);
    if (!context.ok) return reply.code(context.status).send({ error: context.error });
    if (!options.githubConnectionStore) {
      return reply.code(503).send({ error: 'github_connection_store_unavailable' });
    }
    const connection = await options.githubConnectionStore.getConnection(context.scope, context.connectionId);
    if (!connection) return reply.code(404).send({ error: 'github_connection_not_found' });
    if (connection.status !== 'active' || !connection.lastValidatedAt) {
      return reply.code(409).send({ error: 'github_connection_not_validated' });
    }

    const result = await options.githubWebhookStore!.provision(
      context.scope,
      context.actorUserId,
      context.connectionId,
    );
    if (result.status === 'exists') {
      return reply.code(409).send({
        error: 'github_webhook_already_configured',
        webhook: endpointResponse(result.endpoint),
      });
    }
    return reply.code(201).send({
      webhook: endpointResponse(result.endpoint),
      secret: result.secret,
      secretVisibleOnce: true,
    });
  });

  app.post('/v1/integrations/github/connections/:id/webhook/rotate', async (request, reply) => {
    const context = await manageableWebhook(request, options);
    if (!context.ok) return reply.code(context.status).send({ error: context.error });
    const result = await options.githubWebhookStore!.rotateSecret(
      context.scope,
      context.actorUserId,
      context.connectionId,
    );
    if (result.status === 'not_found') {
      return reply.code(404).send({ error: 'github_webhook_not_configured' });
    }
    return {
      webhook: endpointResponse(result.endpoint),
      secret: result.secret,
      secretVisibleOnce: true,
    };
  });

  app.delete('/v1/integrations/github/connections/:id/webhook', async (request, reply) => {
    const context = await manageableWebhook(request, options);
    if (!context.ok) return reply.code(context.status).send({ error: context.error });
    const deleted = await options.githubWebhookStore!.delete(
      context.scope,
      context.actorUserId,
      context.connectionId,
    );
    if (!deleted) return reply.code(404).send({ error: 'github_webhook_not_configured' });
    return { deleted: true };
  });

  app.register((instance, _pluginOptions, done) => {
    instance.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_request, body, parseDone) => parseDone(null, body),
    );

    instance.post('/v1/integrations/github/webhooks/:endpointId', async (request, reply) => {
      if (!options.githubWebhookStore || !options.integrationSyncJobStore) {
        return reply.code(503).send({ error: 'github_webhook_runtime_unavailable' });
      }

      const params = request.params as { endpointId?: string };
      const endpointId = nonEmptyString(params.endpointId, 200);
      if (!endpointId) return reply.code(404).send({ error: 'github_webhook_not_found' });
      const endpoint = await options.githubWebhookStore.resolve(endpointId);
      if (!endpoint) return reply.code(404).send({ error: 'github_webhook_not_found' });

      const rawBody = request.body;
      if (!Buffer.isBuffer(rawBody)) {
        return reply.code(415).send({ error: 'github_webhook_raw_body_required' });
      }
      const verification = verifyGitHubWebhook({
        secret: endpoint.secret,
        rawBody,
        headers: request.headers,
      });
      if (!verification.ok) {
        return reply.code(401).send({ error: 'github_webhook_verification_failed' });
      }

      const claimed = await options.githubWebhookStore.claimDelivery({
        endpointId: endpoint.id,
        workspaceId: endpoint.workspaceId,
        deliveryId: verification.headers.deliveryId,
        event: verification.headers.event,
      });
      if (!claimed) {
        return reply.code(202).send({ accepted: true, replay: true });
      }

      if (!githubWebhookTriggersRepositoryRefresh(verification.headers.event)) {
        return reply.code(202).send({ accepted: true, action: 'ignored' });
      }

      const externalId = repositoryFullName(rawBody);
      if (!externalId) {
        return reply.code(202).send({ accepted: true, action: 'ignored' });
      }
      const resource = await options.githubWebhookStore.resolveRepository(
        endpoint.workspaceId,
        endpoint.connectionId,
        externalId,
      );
      if (!resource) {
        return reply.code(202).send({ accepted: true, action: 'ignored' });
      }

      try {
        const job = await options.integrationSyncJobStore.enqueue({
          workspaceId: endpoint.workspaceId,
          provider: 'github',
          kind: 'repository_signals',
          resourceId: resource.id,
          dedupeKey: `webhook:${endpoint.id}:${verification.headers.deliveryId}`,
        });
        return reply.code(202).send({ accepted: true, action: 'refresh_enqueued', jobId: job.id });
      } catch {
        await options.githubWebhookStore
          .releaseDelivery(endpoint.id, endpoint.workspaceId, verification.headers.deliveryId)
          .catch(() => undefined);
        return reply.code(503).send({ error: 'github_webhook_enqueue_failed' });
      }
    });

    done();
  });
}
