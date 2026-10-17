import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize } from '@kcc/auth';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { Scope, TaskRecurrenceRule } from '@kcc/domain';
import {
  MAX_TASK_RECURRENCE_DAYS,
  MIN_TASK_RECURRENCE_DAYS,
  type TaskRecurrenceStore,
} from './task-recurrence-store';

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
  if (requested !== undefined && requested !== 'workspace') return null;
  return session.activeWorkspaceId
    ? { kind: 'workspace', workspaceId: session.activeWorkspaceId }
    : null;
}

function taskId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 100 ? normalized : null;
}

function recurrenceRule(value: unknown): TaskRecurrenceRule | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== 'kind' && key !== 'intervalDays')) {
    return undefined;
  }
  if (
    record.kind !== 'interval_days' ||
    typeof record.intervalDays !== 'number' ||
    !Number.isInteger(record.intervalDays) ||
    record.intervalDays < MIN_TASK_RECURRENCE_DAYS ||
    record.intervalDays > MAX_TASK_RECURRENCE_DAYS
  ) {
    return undefined;
  }
  return { kind: 'interval_days', intervalDays: record.intervalDays };
}

export function registerTaskRecurrenceRoutes(
  app: FastifyInstance,
  options: { authProvider?: AuthProvider; taskRecurrenceStore?: TaskRecurrenceStore },
): void {
  app.put('/v1/tasks/:id/recurrence', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.taskRecurrenceStore) {
      return reply.code(503).send({ error: 'task_recurrence_store_unavailable' });
    }

    const params = request.params as { id?: unknown };
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (Object.keys(body).some((key) => key !== 'scope' && key !== 'recurrenceRule')) {
      return reply.code(400).send({ error: 'invalid_task_recurrence' });
    }

    const id = taskId(params.id);
    const scope = resolveManualScope(session, body.scope);
    const rule = recurrenceRule(body.recurrenceRule);
    if (!id) return reply.code(400).send({ error: 'invalid_task_id' });
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (rule === undefined) {
      return reply.code(400).send({ error: 'invalid_task_recurrence' });
    }

    if (
      !authorize(session, {
        scope,
        capability: 'tasks.write',
        product: 'command-center',
      })
    ) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const result = await options.taskRecurrenceStore.setRecurrenceRule({
      scope,
      actorUserId: session.user.id,
      taskId: id,
      recurrenceRule: rule,
    });

    if (result.ok) return { task: result.task };
    if (result.error === 'task_not_found') {
      return reply.code(404).send({ error: result.error });
    }
    return reply.code(409).send({ error: result.error });
  });
}
