import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize } from '@kcc/auth';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { OperationalStore } from '@kcc/persistence';
import type { DecisionLifecycleStore, WorkspaceScope } from './decision-lifecycle-store';

export type DecisionRouteOptions = {
  authProvider?: AuthProvider;
  operationalStore?: OperationalStore;
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

async function timeline(
  store: OperationalStore,
  input: {
    scope: WorkspaceScope;
    type: string;
    actorUserId: string;
    entityId: string;
    summary: string;
    metadata?: Record<string, unknown>;
  },
) {
  return store.appendTimeline({
    scope: input.scope,
    type: input.type,
    actorUserId: input.actorUserId,
    entityType: 'decision',
    entityId: input.entityId,
    summary: input.summary,
    source: 'manual-api',
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}

export function registerDecisionLifecycleRoutes(
  app: FastifyInstance,
  options: DecisionRouteOptions,
): void {
  app.post('/v1/decision-lifecycle', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.operationalStore || !options.decisionLifecycleStore) {
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

    if (projectId && !(await options.decisionLifecycleStore.projectExists(scope, projectId))) {
      return reply.code(404).send({ error: 'project_not_found' });
    }

    let superseded = null;
    let effectiveProjectId = projectId;
    if (supersedesId) {
      superseded = await options.decisionLifecycleStore.getDecision(scope, supersedesId);
      if (!superseded) return reply.code(404).send({ error: 'decision_not_found' });
      if (superseded.status !== 'active') {
        return reply.code(409).send({ error: 'decision_not_active' });
      }
      if (projectId && superseded.projectId && projectId !== superseded.projectId) {
        return reply.code(409).send({ error: 'decision_project_mismatch' });
      }
      effectiveProjectId = projectId ?? superseded.projectId;
    }

    const decision = await options.operationalStore.createDecision({
      scope,
      title,
      decision: decisionText,
      madeBy: session.user.id,
      ...(context ? { context } : {}),
      ...(effectiveProjectId ? { projectId: effectiveProjectId } : {}),
      ...(supersedesId ? { supersedesId } : {}),
      ...(madeAt ? { madeAt } : {}),
    });

    if (supersedesId && superseded) {
      const transitioned = await options.decisionLifecycleStore.transitionActiveDecision(
        scope,
        supersedesId,
        'superseded',
      );
      if (!transitioned) {
        await options.decisionLifecycleStore.transitionActiveDecision(scope, decision.id, 'reversed');
        return reply.code(409).send({ error: 'decision_transition_conflict' });
      }
      await timeline(options.operationalStore, {
        scope,
        type: 'decision.superseded',
        actorUserId: session.user.id,
        entityId: transitioned.id,
        summary: transitioned.title,
        metadata: { replacementDecisionId: decision.id },
      });
    }

    await timeline(options.operationalStore, {
      scope,
      type: 'decision.created',
      actorUserId: session.user.id,
      entityId: decision.id,
      summary: decision.title,
      metadata: {
        ...(decision.projectId ? { projectId: decision.projectId } : {}),
        ...(decision.supersedesId ? { supersedesId: decision.supersedesId } : {}),
      },
    });

    return reply.code(201).send({ decision });
  });

  app.patch('/v1/decision-lifecycle/:id/reverse', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.operationalStore || !options.decisionLifecycleStore) {
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

    const existing = await options.decisionLifecycleStore.getDecision(scope, decisionId);
    if (!existing) return reply.code(404).send({ error: 'decision_not_found' });
    if (existing.status !== 'active') {
      return reply.code(409).send({ error: 'decision_not_active' });
    }

    const decision = await options.decisionLifecycleStore.transitionActiveDecision(
      scope,
      decisionId,
      'reversed',
    );
    if (!decision) return reply.code(409).send({ error: 'decision_transition_conflict' });

    await timeline(options.operationalStore, {
      scope,
      type: 'decision.reversed',
      actorUserId: session.user.id,
      entityId: decision.id,
      summary: decision.title,
      metadata: { reason },
    });

    return { decision };
  });
}
