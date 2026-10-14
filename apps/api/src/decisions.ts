import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authorize } from '@kcc/auth';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type {
  DecisionLifecycleError,
  DecisionLifecycleStore,
  WorkspaceScope,
} from './decision-lifecycle-store';

export type DecisionRouteOptions = {
  authProvider?: AuthProvider;
  decisionLifecycleStore?: DecisionLifecycleStore;
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

function text(value: unknown, maxLength: number, required = false): string | undefined | null {
  if (value === undefined || value === null || value === '') return required ? null : undefined;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return required ? null : undefined;
  return normalized.length <= maxLength ? normalized : null;
}

function isoDate(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 40) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function sendLifecycleError(reply: FastifyReply, error: DecisionLifecycleError) {
  const status = error === 'project_not_found' || error === 'decision_not_found' ? 404 : 409;
  return reply.code(status).send({ error });
}

export function registerDecisionLifecycleRoutes(
  app: FastifyInstance,
  options: DecisionRouteOptions,
): void {
  app.post('/v1/decision-lifecycle', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.decisionLifecycleStore) {
      return reply.code(503).send({ error: 'decision_lifecycle_unavailable' });
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    if (body.scope === 'private') return reply.code(400).send({ error: 'workspace_only' });
    const scope = workspaceScope(session);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (
      !authorize(session, {
        scope,
        capability: 'decisions.write',
        product: 'command-center',
      })
    ) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const title = text(body.title, 240, true);
    const decisionText = text(body.decision, 8000, true);
    const context = text(body.context, 8000);
    const projectId = text(body.projectId, 100);
    const supersedesId = text(body.supersedesId, 100);
    const madeAt = isoDate(body.madeAt);
    if (!title) return reply.code(400).send({ error: 'invalid_title' });
    if (!decisionText) return reply.code(400).send({ error: 'invalid_decision' });
    if (context === null) return reply.code(400).send({ error: 'invalid_context' });
    if (projectId === null) return reply.code(400).send({ error: 'invalid_project_id' });
    if (supersedesId === null) return reply.code(400).send({ error: 'invalid_supersedes_id' });
    if (madeAt === null) return reply.code(400).send({ error: 'invalid_made_at' });

    const result = await options.decisionLifecycleStore.createWithAudit({
      scope,
      title,
      decision: decisionText,
      madeBy: session.user.id,
      ...(context ? { context } : {}),
      ...(projectId ? { projectId } : {}),
      ...(supersedesId ? { supersedesId } : {}),
      ...(madeAt ? { madeAt } : {}),
    });
    if (!result.ok) return sendLifecycleError(reply, result.error);
    return reply.code(201).send({ decision: result.decision });
  });

  app.patch('/v1/decision-lifecycle/:id/reverse', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.decisionLifecycleStore) {
      return reply.code(503).send({ error: 'decision_lifecycle_unavailable' });
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    if (body.scope === 'private') return reply.code(400).send({ error: 'workspace_only' });
    const scope = workspaceScope(session);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (
      !authorize(session, {
        scope,
        capability: 'decisions.write',
        product: 'command-center',
      })
    ) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const params = request.params as { id?: string };
    const decisionId = text(params.id, 100, true);
    const reason = text(body.reason, 4000, true);
    if (!decisionId) return reply.code(400).send({ error: 'invalid_decision_id' });
    if (!reason) return reply.code(400).send({ error: 'invalid_reversal_reason' });

    const result = await options.decisionLifecycleStore.reverseWithAudit({
      scope,
      decisionId,
      actorUserId: session.user.id,
      reason,
    });
    if (!result.ok) return sendLifecycleError(reply, result.error);
    return { decision: result.decision };
  });
}
