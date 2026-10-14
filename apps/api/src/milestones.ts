import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize } from '@kcc/auth';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { MilestoneStatus, Scope } from '@kcc/domain';
import type { MilestoneStore } from '@kcc/persistence';

const MILESTONE_STATUSES: readonly MilestoneStatus[] = ['planned', 'active', 'done', 'cancelled'];

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

function resolveManualScope(session: SessionContext, requested: unknown): Scope | null {
  if (requested === 'private') return { kind: 'private', userId: session.user.id };
  return session.activeWorkspaceId
    ? { kind: 'workspace', workspaceId: session.activeWorkspaceId }
    : null;
}

function canUseMilestones(
  session: SessionContext,
  scope: Scope,
  capability: 'milestones.read' | 'milestones.write',
): boolean {
  return authorize(session, { scope, capability, product: 'command-center' });
}

function nonEmptyString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function optionalString(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : undefined;
}

function validIsoDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 40) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function milestoneStatus(value: unknown): MilestoneStatus | null {
  return typeof value === 'string' && MILESTONE_STATUSES.includes(value as MilestoneStatus)
    ? (value as MilestoneStatus)
    : null;
}

export function registerMilestoneRoutes(
  app: FastifyInstance,
  options: { authProvider?: AuthProvider; milestoneStore?: MilestoneStore },
): void {
  app.get('/v1/milestones', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.milestoneStore) return reply.code(503).send({ error: 'milestone_store_unavailable' });

    const query = request.query as { scope?: string; projectId?: string };
    const scope = resolveManualScope(session, query.scope);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canUseMilestones(session, scope, 'milestones.read')) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const projectId = optionalString(query.projectId, 100);
    return {
      milestones: await options.milestoneStore.listMilestones(scope, projectId),
    };
  });

  app.post('/v1/milestones', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.milestoneStore) return reply.code(503).send({ error: 'milestone_store_unavailable' });

    const body = (request.body ?? {}) as Record<string, unknown>;
    const scope = resolveManualScope(session, body.scope);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canUseMilestones(session, scope, 'milestones.write')) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const projectId = nonEmptyString(body.projectId, 100);
    const title = nonEmptyString(body.title, 240);
    if (!projectId) return reply.code(400).send({ error: 'invalid_project_id' });
    if (!title) return reply.code(400).send({ error: 'invalid_title' });
    if (typeof body.weight !== 'number' || !Number.isFinite(body.weight) || body.weight <= 0) {
      return reply.code(400).send({ error: 'invalid_weight' });
    }

    const dueAt = body.dueAt === undefined ? undefined : validIsoDate(body.dueAt);
    if (body.dueAt !== undefined && !dueAt) return reply.code(400).send({ error: 'invalid_due_at' });

    const result = await options.milestoneStore.createMilestone({
      scope,
      projectId,
      title,
      weight: body.weight,
      ...(dueAt ? { dueAt } : {}),
    });
    if (!result) return reply.code(404).send({ error: 'project_not_found' });

    await options.milestoneStore.appendTimeline({
      scope,
      type: 'milestone.created',
      actorUserId: session.user.id,
      entityType: 'milestone',
      entityId: result.milestone.id,
      summary: result.milestone.title,
      source: 'manual-api',
      metadata: {
        projectId: result.milestone.projectId,
        weight: result.milestone.weight,
        projectProgress: result.projectProgress,
      },
    });

    return reply.code(201).send(result);
  });

  app.patch('/v1/milestones/:id/status', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.milestoneStore) return reply.code(503).send({ error: 'milestone_store_unavailable' });

    const body = (request.body ?? {}) as Record<string, unknown>;
    const params = request.params as { id?: string };
    const milestoneId = nonEmptyString(params.id, 100);
    const scope = resolveManualScope(session, body.scope);
    const status = milestoneStatus(body.status);
    if (!milestoneId) return reply.code(400).send({ error: 'invalid_milestone_id' });
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!status) return reply.code(400).send({ error: 'invalid_status' });
    if (!canUseMilestones(session, scope, 'milestones.write')) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const result = await options.milestoneStore.updateMilestoneStatus(scope, milestoneId, status);
    if (!result) return reply.code(404).send({ error: 'milestone_not_found' });

    await options.milestoneStore.appendTimeline({
      scope,
      type: 'milestone.status_changed',
      actorUserId: session.user.id,
      entityType: 'milestone',
      entityId: result.milestone.id,
      summary: `${result.milestone.title}: ${result.milestone.status}`,
      source: 'manual-api',
      metadata: {
        projectId: result.milestone.projectId,
        status: result.milestone.status,
        projectProgress: result.projectProgress,
      },
    });

    return result;
  });
}
