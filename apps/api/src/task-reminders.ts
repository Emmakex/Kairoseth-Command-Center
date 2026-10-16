import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize } from '@kcc/auth';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { Scope, TaskReminderRule } from '@kcc/domain';
import { MAX_TASK_REMINDERS, type TaskReminderStore } from './task-reminder-store';

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

function reminderRules(value: unknown): TaskReminderRule[] | null {
  if (!Array.isArray(value) || value.length > MAX_TASK_REMINDERS) return null;
  const rules: TaskReminderRule[] = [];
  const instants = new Set<string>();

  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const record = entry as Record<string, unknown>;
    if (Object.keys(record).some((key) => key !== 'kind' && key !== 'remindAt')) return null;
    if (record.kind !== 'at' || typeof record.remindAt !== 'string') return null;
    const timestamp = Date.parse(record.remindAt);
    if (!Number.isFinite(timestamp)) return null;
    const remindAt = new Date(timestamp).toISOString();
    if (instants.has(remindAt)) return null;
    instants.add(remindAt);
    rules.push({ kind: 'at', remindAt });
  }

  return rules.sort((left, right) => left.remindAt.localeCompare(right.remindAt));
}

export function registerTaskReminderRoutes(
  app: FastifyInstance,
  options: { authProvider?: AuthProvider; taskReminderStore?: TaskReminderStore },
): void {
  app.put('/v1/tasks/:id/reminders', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.taskReminderStore) {
      return reply.code(503).send({ error: 'task_reminder_store_unavailable' });
    }

    const params = request.params as { id?: unknown };
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (Object.keys(body).some((key) => key !== 'scope' && key !== 'reminderRules')) {
      return reply.code(400).send({ error: 'invalid_task_reminders' });
    }

    const id = taskId(params.id);
    const scope = resolveManualScope(session, body.scope);
    const rules = reminderRules(body.reminderRules);
    if (!id) return reply.code(400).send({ error: 'invalid_task_id' });
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!rules) return reply.code(400).send({ error: 'invalid_task_reminders' });

    if (
      !authorize(session, {
        scope,
        capability: 'tasks.write',
        product: 'command-center',
      })
    ) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const result = await options.taskReminderStore.setReminderRules({
      scope,
      actorUserId: session.user.id,
      taskId: id,
      reminderRules: rules,
    });

    if (result.ok) return { task: result.task };
    if (result.error === 'task_not_found') {
      return reply.code(404).send({ error: result.error });
    }
    return reply.code(409).send({ error: result.error });
  });
}
