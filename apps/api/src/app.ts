import Fastify from 'fastify';
import type { FastifyRequest } from 'fastify';
import { authorize } from '@kcc/auth';
import type { AuthProvider, Capability, SessionContext } from '@kcc/auth';
import type { HealthResponse, ReadyResponse } from '@kcc/contracts';
import type { Scope } from '@kcc/domain';
import type { OperationalStore } from '@kcc/persistence';

export type ReadinessCheck = () => Promise<Record<string, 'ok' | 'error' | 'not_configured'>>;

type AppOptions = {
  readinessCheck?: ReadinessCheck;
  logger?: boolean;
  authProvider?: AuthProvider;
  operationalStore?: OperationalStore;
};

type ManualScopeKind = 'workspace' | 'private';

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
  const kind: ManualScopeKind = requested === 'private' ? 'private' : 'workspace';

  if (kind === 'private') {
    return { kind: 'private', userId: session.user.id };
  }

  return session.activeWorkspaceId
    ? { kind: 'workspace', workspaceId: session.activeWorkspaceId }
    : null;
}

function canUseCommandCenter(
  session: SessionContext,
  scope: Scope,
  capability: Capability,
): boolean {
  return authorize(session, {
    scope,
    capability,
    product: 'command-center',
  });
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

export function buildApp(options: AppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? false });
  const readinessCheck = options.readinessCheck ?? (async () => ({ process: 'ok' as const }));

  app.get('/health', async (): Promise<HealthResponse> => ({
    status: 'ok',
    service: 'kairoseth-command-center-api',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  }));

  app.get('/ready', async (_request, reply): Promise<ReadyResponse> => {
    const checks = await readinessCheck();
    const ready = Object.values(checks).every((value) => value === 'ok' || value === 'not_configured');

    if (!ready) reply.code(503);

    return {
      status: ready ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    };
  });

  app.get('/v1/session', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const session = await resolveSession(request, options.authProvider);

    if (!session) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    return {
      user: session.user,
      activeWorkspaceId: session.activeWorkspaceId ?? null,
      membershipId: session.membershipId ?? null,
      role: session.role ?? null,
      capabilities: session.capabilities,
      productEntitlements: session.productEntitlements,
    };
  });

  app.get('/v1/projects', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.operationalStore) return reply.code(503).send({ error: 'operational_store_unavailable' });

    const query = request.query as { scope?: string };
    const scope = resolveManualScope(session, query.scope);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canUseCommandCenter(session, scope, 'projects.read')) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    return { projects: await options.operationalStore.listProjects(scope) };
  });

  app.post('/v1/projects', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.operationalStore) return reply.code(503).send({ error: 'operational_store_unavailable' });

    const body = (request.body ?? {}) as Record<string, unknown>;
    const scope = resolveManualScope(session, body.scope);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canUseCommandCenter(session, scope, 'projects.write')) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const name = nonEmptyString(body.name, 160);
    if (!name) return reply.code(400).send({ error: 'invalid_name' });

    const dueAt = body.dueAt === undefined ? undefined : validIsoDate(body.dueAt);
    if (body.dueAt !== undefined && !dueAt) return reply.code(400).send({ error: 'invalid_due_at' });

    const project = await options.operationalStore.createProject({
      scope,
      name,
      ownerUserId: session.user.id,
      ...(optionalString(body.description, 4000) ? { description: optionalString(body.description, 4000) } : {}),
      ...(dueAt ? { dueAt } : {}),
    });

    return reply.code(201).send({ project });
  });

  app.get('/v1/tasks', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.operationalStore) return reply.code(503).send({ error: 'operational_store_unavailable' });

    const query = request.query as { scope?: string };
    const scope = resolveManualScope(session, query.scope);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canUseCommandCenter(session, scope, 'tasks.read')) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    return { tasks: await options.operationalStore.listTasks(scope) };
  });

  app.post('/v1/tasks', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.operationalStore) return reply.code(503).send({ error: 'operational_store_unavailable' });

    const body = (request.body ?? {}) as Record<string, unknown>;
    const scope = resolveManualScope(session, body.scope);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canUseCommandCenter(session, scope, 'tasks.write')) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const title = nonEmptyString(body.title, 240);
    if (!title) return reply.code(400).send({ error: 'invalid_title' });

    const dueAt = body.dueAt === undefined ? undefined : validIsoDate(body.dueAt);
    if (body.dueAt !== undefined && !dueAt) return reply.code(400).send({ error: 'invalid_due_at' });

    const priority = typeof body.priority === 'number' ? body.priority : undefined;
    const projectId = optionalString(body.projectId, 100);
    const description = optionalString(body.description, 8000);

    const task = await options.operationalStore.createTask({
      scope,
      title,
      assigneeIds: scope.kind === 'private' ? [session.user.id] : [],
      ...(description ? { description } : {}),
      ...(projectId ? { projectId } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(dueAt ? { dueAt } : {}),
    });

    return reply.code(201).send({ task });
  });

  app.get('/v1/today', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.operationalStore) return reply.code(503).send({ error: 'operational_store_unavailable' });

    const query = request.query as { scope?: string };
    const scope = resolveManualScope(session, query.scope);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canUseCommandCenter(session, scope, 'tasks.read')) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const range = todayRange(session.user.timezone);
    const [summary, projects, tasks, alerts] = await Promise.all([
      options.operationalStore.getTodaySummary(scope, range),
      options.operationalStore.listProjects(scope),
      options.operationalStore.listTasks(scope),
      options.operationalStore.listAlerts(scope),
    ]);

    return {
      scope: scope.kind,
      range,
      summary,
      projects: projects.slice(0, 8),
      tasks: tasks.filter((task) => task.status !== 'done' && task.status !== 'cancelled').slice(0, 12),
      alerts: alerts.filter((alert) => alert.status === 'open' || alert.status === 'acknowledged').slice(0, 8),
    };
  });

  return app;
}
