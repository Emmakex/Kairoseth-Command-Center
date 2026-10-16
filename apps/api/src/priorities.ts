import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize } from '@kcc/auth';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import { rankOperationalPriorities } from '@kcc/domain';
import type { Scope } from '@kcc/domain';
import type { MilestoneStore, OperationalStore } from '@kcc/persistence';

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

function partsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

function localDateTimeToUtc(
  local: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  timeZone: string,
): Date {
  const targetAsUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  let guess = new Date(targetAsUtc);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = partsInZone(guess, timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    guess = new Date(guess.getTime() + (targetAsUtc - actualAsUtc));
  }
  return guess;
}

function todayRange(timeZone: string, now = new Date()): { start: string; end: string } {
  let local;
  try {
    local = partsInZone(now, timeZone);
  } catch {
    local = partsInZone(now, 'UTC');
    timeZone = 'UTC';
  }

  const start = localDateTimeToUtc(
    { year: local.year, month: local.month, day: local.day, hour: 0, minute: 0, second: 0 },
    timeZone,
  );
  const nextCalendarDate = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  const end = localDateTimeToUtc(
    {
      year: nextCalendarDate.getUTCFullYear(),
      month: nextCalendarDate.getUTCMonth() + 1,
      day: nextCalendarDate.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone,
  );
  return { start: start.toISOString(), end: end.toISOString() };
}

export function registerPriorityRoutes(
  app: FastifyInstance,
  options: {
    authProvider?: AuthProvider;
    operationalStore?: OperationalStore;
    milestoneStore?: MilestoneStore;
  },
): void {
  app.get('/v1/priorities', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.operationalStore) {
      return reply.code(503).send({ error: 'operational_store_unavailable' });
    }
    if (!options.milestoneStore) {
      return reply.code(503).send({ error: 'milestone_store_unavailable' });
    }

    const query = request.query as { scope?: string; limit?: string };
    const scope = resolveManualScope(session, query.scope);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });

    const canRead =
      authorize(session, { scope, capability: 'tasks.read', product: 'command-center' }) &&
      authorize(session, { scope, capability: 'alerts.read', product: 'command-center' }) &&
      authorize(session, { scope, capability: 'projects.read', product: 'command-center' }) &&
      authorize(session, { scope, capability: 'milestones.read', product: 'command-center' });
    if (!canRead) return reply.code(403).send({ error: 'forbidden' });

    const requestedLimit = query.limit === undefined ? 8 : Number(query.limit);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 20) {
      return reply.code(400).send({ error: 'invalid_limit' });
    }

    const [tasks, alerts, projects, milestones] = await Promise.all([
      options.operationalStore.listTasks(scope),
      options.operationalStore.listAlerts(scope),
      options.operationalStore.listProjects(scope),
      options.milestoneStore.listMilestones(scope),
    ]);
    const range = todayRange(session.user.timezone);

    return {
      scope: scope.kind,
      range,
      priorities: rankOperationalPriorities({
        tasks,
        alerts,
        projects,
        milestones,
        range,
        limit: requestedLimit,
      }),
    };
  });
}
