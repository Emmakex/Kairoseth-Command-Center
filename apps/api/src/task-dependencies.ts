import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize } from '@kcc/auth';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { Scope } from '@kcc/domain';
import {
  MAX_TASK_DEPENDENCIES,
  type TaskDependencyStore,
} from './task-dependency-store';

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

function taskId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 100 ? normalized : null;
}

function dependencyIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_TASK_DEPENDENCIES) return null;
  const normalized: string[] = [];
  for (const entry of value) {
    const id = taskId(entry);
    if (!id) return null;
    normalized.push(id);
  }
  if (new Set(normalized).size !== normalized.length) return null;
  return normalized;
}

export function registerTaskDependencyRoutes(
  app: FastifyInstance,
  options: {
    authProvider?: AuthProvider;
    taskDependencyStore?: TaskDependencyStore;
  },
): void {
  app.put('/v1/tasks/:id/dependencies', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.taskDependencyStore) {
      return reply.code(503).send({ error: 'task_dependency_store_unavailable' });
    }

    const params = request.params as { id?: unknown };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const id = taskId(params.id);
    const scope = resolveManualScope(session, body.scope);
    const dependencies = dependencyIds(body.dependencyIds);
    if (!id) return reply.code(400).send({ error: 'invalid_task_id' });
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!dependencies) return reply.code(400).send({ error: 'invalid_dependency_ids' });
    if (
      !authorize(session, {
        scope,
        capability: 'tasks.write',
        product: 'command-center',
      })
    ) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const result = await options.taskDependencyStore.setDependencies({
      scope,
      actorUserId: session.user.id,
      taskId: id,
      dependencyIds: dependencies,
    });
    if (result.ok) return { task: result.task };

    if (result.error === 'task_not_found') {
      return reply.code(404).send({ error: result.error });
    }
    if (result.error === 'dependency_not_found') {
      return reply.code(409).send({
        error: result.error,
        ...(result.dependencyId ? { dependencyId: result.dependencyId } : {}),
      });
    }
    return reply.code(409).send({ error: result.error });
  });
}
