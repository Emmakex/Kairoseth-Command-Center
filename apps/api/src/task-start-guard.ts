import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize } from '@kcc/auth';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { Scope } from '@kcc/domain';
import type { OperationalStore } from '@kcc/persistence';

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

export function registerTaskStartGuard(
  app: FastifyInstance,
  options: { authProvider?: AuthProvider; operationalStore?: OperationalStore },
): void {
  const operationalStore = options.operationalStore;
  if (!operationalStore) return;

  app.addHook('preHandler', async (request, reply) => {
    if (request.method !== 'PATCH' || request.routeOptions.url !== '/v1/tasks/:id/status') return;

    const body = (request.body ?? {}) as Record<string, unknown>;
    if (body.status !== 'in_progress') return;

    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });

    const params = request.params as { id?: unknown };
    const id = taskId(params.id);
    const scope = resolveManualScope(session, body.scope);
    if (!id || !scope) return;

    if (
      !authorize(session, {
        scope,
        capability: 'tasks.write',
        product: 'command-center',
      })
    ) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const tasks = await operationalStore.listTasks(scope);
    const task = tasks.find((candidate) => candidate.id === id);
    if (!task) return;

    const byId = new Map(tasks.map((candidate) => [candidate.id, candidate] as const));
    const pendingDependencyIds = (task.dependencyIds ?? []).filter(
      (dependencyId) => byId.get(dependencyId)?.status !== 'done',
    );

    if (pendingDependencyIds.length > 0) {
      return reply.code(409).send({
        error: 'task_dependencies_incomplete',
        dependencyIds: pendingDependencyIds,
      });
    }
  });
}
