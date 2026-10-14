import Fastify from 'fastify';
import type { FastifyRequest } from 'fastify';
import { authorize } from '@kcc/auth';
import type { AuthProvider, Capability, SessionContext } from '@kcc/auth';
import type { HealthResponse, ReadyResponse } from '@kcc/contracts';
import type {
  AlertSeverity,
  AlertStatus,
  ProjectStatus,
  Scope,
  TaskStatus,
} from '@kcc/domain';
import type { OperationalStore } from '@kcc/persistence';

export type ReadinessCheck = () => Promise<Record<string, 'ok' | 'error' | 'not_configured'>>;

type AppOptions = {
  readinessCheck?: ReadinessCheck;
  logger?: boolean;
  authProvider?: AuthProvider;
  operationalStore?: OperationalStore;
};

type ManualScopeKind = 'workspace' | 'private';
type QuickCaptureKind = 'project' | 'task';

const PROJECT_STATUSES: readonly ProjectStatus[] = ['planned', 'active', 'blocked', 'done', 'archived'];
const TASK_STATUSES: readonly TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'];
const ALERT_SEVERITIES: readonly AlertSeverity[] = ['info', 'warning', 'urgent', 'critical'];
const ALERT_STATUSES: readonly AlertStatus[] = ['open', 'acknowledged', 'resolved', 'dismissed'];

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

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : null;
}

async function recordTimeline(
  store: OperationalStore,
  input: {
    scope: Scope;
    type: string;
    actorUserId: string;
    entityType: string;
    entityId: string;
    summary: string;
    metadata?: Record<string, unknown>;
  },
) {
  return store.appendTimeline({
    scope: input.scope,
    type: input.type,
    actorUserId: input.actorUserId,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    source: 'manual-api',
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
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
    const description = optionalString(body.description, 4000);

    const project = await options.operationalStore.createProject({
      scope,
      name,
      ownerUserId: session.user.id,
      ...(description ? { description } : {}),
      ...(dueAt ? { dueAt } : {}),
    });
    await recordTimeline(options.operationalStore, {
      scope,
      type: 'project.created',
      actorUserId: session.user.id,
      entityType: 'project',
      entityId: project.id,
      summary: project.name,
    });

    return reply.code(201).send({ project });
  });

  app.patch('/v1/projects/:id/status', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.operationalStore) return reply.code(503).send({ error: 'operational_store_unavailable' });

    const body = (request.body ?? {}) as Record<string, unknown>;
    const params = request.params as { id?: string };
    const projectId = nonEmptyString(params.id, 100);
    const scope = resolveManualScope(session, body.scope);
    const status = enumValue(body.status, PROJECT_STATUSES);
    if (!projectId) return reply.code(400).send({ error: 'invalid_project_id' });
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!status) return reply.code(400).send({ error: 'invalid_status' });
    if (body.progress !== undefined && typeof body.progress !== 'number') {
      return reply.code(400).send({ error: 'invalid_progress' });
    }
    if (!canUseCommandCenter(session, scope, 'projects.write')) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const project = await options.operationalStore.updateProjectStatus(
      scope,
      projectId,
      status,
      typeof body.progress === 'number' ? body.progress : undefined,
    );
    if (!project) return reply.code(404).send({ error: 'project_not_found' });

    await recordTimeline(options.operationalStore, {
      scope,
      type: 'project.status_changed',
      actorUserId: session.user.id,
      entityType: 'project',
      entityId: project.id,
      summary: `${project.name}: ${project.status}`,
      metadata: { status: project.status, progress: project.progress },
    });

    return { project };
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
    await recordTimeline(options.operationalStore, {
      scope,
      type: 'task.created',
      actorUserId: session.user.id,
      entityType: 'task',
      entityId: task.id,
      summary: task.title,
    });

    return reply.code(201).send({ task });
  });

  app.patch('/v1/tasks/:id/status', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.operationalStore) return reply.code(503).send({ error: 'operational_store_unavailable' });

    const body = (request.body ?? {}) as Record<string, unknown>;
    const params = request.params as { id?: string };
    const taskId = nonEmptyString(params.id, 100);
    const scope = resolveManualScope(session, body.scope);
    const status = enumValue(body.status, TASK_STATUSES);
    if (!taskId) return reply.code(400).send({ error: 'invalid_task_id' });
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!status) return reply.code(400).send({ error: 'invalid_status' });
    if (!canUseCommandCenter(session, scope, 'tasks.write')) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const task = await options.operationalStore.updateTaskStatus(scope, taskId, status);
    if (!task) return reply.code(404).send({ error: 'task_not_found' });

    await recordTimeline(options.operationalStore, {
      scope,
      type: 'task.status_changed',
      actorUserId: session.user.id,
      entityType: 'task',
      entityId: task.id,
      summary: `${task.title}: ${task.status}`,
      metadata: { status: task.status },
    });

    return { task };
  });

  app.get('/v1/alerts', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.operationalStore) return reply.code(503).send({ error: 'operational_store_unavailable' });

    const query = request.query as { scope?: string };
    const scope = resolveManualScope(session, query.scope);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canUseCommandCenter(session, scope, 'alerts.read')) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    return { alerts: await options.operationalStore.listAlerts(scope) };
  });

  app.post('/v1/alerts', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.operationalStore) return reply.code(503).send({ error: 'operational_store_unavailable' });

    const body = (request.body ?? {}) as Record<string, unknown>;
    const scope = resolveManualScope(session, body.scope);
    const title = nonEmptyString(body.title, 240);
    const severity = enumValue(body.severity, ALERT_SEVERITIES);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!title) return reply.code(400).send({ error: 'invalid_title' });
    if (!severity) return reply.code(400).send({ error: 'invalid_severity' });
    if (!canUseCommandCenter(session, scope, 'alerts.manage')) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const message = optionalString(body.message, 8000);
    const projectId = optionalString(body.projectId, 100);
    const fingerprint = optionalString(body.fingerprint, 200);
    const alert = await options.operationalStore.createAlert({
      scope,
      title,
      severity,
      ...(message ? { message } : {}),
      ...(projectId ? { projectId } : {}),
      ...(fingerprint ? { fingerprint } : {}),
    });
    await recordTimeline(options.operationalStore, {
      scope,
      type: 'alert.created',
      actorUserId: session.user.id,
      entityType: 'alert',
      entityId: alert.id,
      summary: alert.title,
      metadata: { severity: alert.severity },
    });

    return reply.code(201).send({ alert });
  });

  app.patch('/v1/alerts/:id/status', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.operationalStore) return reply.code(503).send({ error: 'operational_store_unavailable' });

    const body = (request.body ?? {}) as Record<string, unknown>;
    const params = request.params as { id?: string };
    const alertId = nonEmptyString(params.id, 100);
    const scope = resolveManualScope(session, body.scope);
    const status = enumValue(body.status, ALERT_STATUSES);
    if (!alertId) return reply.code(400).send({ error: 'invalid_alert_id' });
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!status) return reply.code(400).send({ error: 'invalid_status' });
    if (!canUseCommandCenter(session, scope, 'alerts.manage')) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const alert = await options.operationalStore.updateAlertStatus(scope, alertId, status);
    if (!alert) return reply.code(404).send({ error: 'alert_not_found' });

    await recordTimeline(options.operationalStore, {
      scope,
      type: 'alert.status_changed',
      actorUserId: session.user.id,
      entityType: 'alert',
      entityId: alert.id,
      summary: `${alert.title}: ${alert.status}`,
      metadata: { status: alert.status, severity: alert.severity },
    });

    return { alert };
  });

  app.get('/v1/decisions', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.operationalStore) return reply.code(503).send({ error: 'operational_store_unavailable' });

    const scope = resolveManualScope(session, 'workspace');
    if (!scope || scope.kind !== 'workspace') return reply.code(400).send({ error: 'workspace_required' });
    if (!canUseCommandCenter(session, scope, 'decisions.read')) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    return { decisions: await options.operationalStore.listDecisions(scope) };
  });

  app.post('/v1/decisions', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.operationalStore) return reply.code(503).send({ error: 'operational_store_unavailable' });

    const body = (request.body ?? {}) as Record<string, unknown>;
    if (body.scope === 'private') return reply.code(400).send({ error: 'workspace_only' });
    const scope = resolveManualScope(session, 'workspace');
    if (!scope || scope.kind !== 'workspace') return reply.code(400).send({ error: 'workspace_required' });
    if (!canUseCommandCenter(session, scope, 'decisions.write')) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const title = nonEmptyString(body.title, 240);
    const decisionText = nonEmptyString(body.decision, 8000);
    if (!title) return reply.code(400).send({ error: 'invalid_title' });
    if (!decisionText) return reply.code(400).send({ error: 'invalid_decision' });

    const projectId = optionalString(body.projectId, 100);
    const context = optionalString(body.context, 8000);
    const supersedesId = optionalString(body.supersedesId, 100);
    const madeAt = body.madeAt === undefined ? undefined : validIsoDate(body.madeAt);
    if (body.madeAt !== undefined && !madeAt) return reply.code(400).send({ error: 'invalid_made_at' });

    const decision = await options.operationalStore.createDecision({
      scope,
      title,
      decision: decisionText,
      madeBy: session.user.id,
      ...(projectId ? { projectId } : {}),
      ...(context ? { context } : {}),
      ...(supersedesId ? { supersedesId } : {}),
      ...(madeAt ? { madeAt } : {}),
    });
    await recordTimeline(options.operationalStore, {
      scope,
      type: 'decision.created',
      actorUserId: session.user.id,
      entityType: 'decision',
      entityId: decision.id,
      summary: decision.title,
    });

    return reply.code(201).send({ decision });
  });

  app.get('/v1/timeline', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.operationalStore) return reply.code(503).send({ error: 'operational_store_unavailable' });

    const query = request.query as { scope?: string };
    const scope = resolveManualScope(session, query.scope);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canUseCommandCenter(session, scope, 'timeline.read')) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    return { events: await options.operationalStore.listTimeline(scope) };
  });

  app.post('/v1/quick-capture', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.operationalStore) return reply.code(503).send({ error: 'operational_store_unavailable' });

    const body = (request.body ?? {}) as Record<string, unknown>;
    const scope = resolveManualScope(session, body.scope);
    const kind: QuickCaptureKind | null = body.kind === 'project' || body.kind === 'task' ? body.kind : null;
    const title = nonEmptyString(body.title, kind === 'project' ? 160 : 240);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!kind) return reply.code(400).send({ error: 'invalid_kind' });
    if (!title) return reply.code(400).send({ error: 'invalid_title' });

    const dueAt = body.dueAt === undefined ? undefined : validIsoDate(body.dueAt);
    if (body.dueAt !== undefined && !dueAt) return reply.code(400).send({ error: 'invalid_due_at' });
    const description = optionalString(body.description, kind === 'project' ? 4000 : 8000);

    if (kind === 'project') {
      if (!canUseCommandCenter(session, scope, 'projects.write')) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      const project = await options.operationalStore.createProject({
        scope,
        name: title,
        ownerUserId: session.user.id,
        ...(description ? { description } : {}),
        ...(dueAt ? { dueAt } : {}),
      });
      await recordTimeline(options.operationalStore, {
        scope,
        type: 'project.quick_captured',
        actorUserId: session.user.id,
        entityType: 'project',
        entityId: project.id,
        summary: project.name,
      });
      return reply.code(201).send({ kind, project });
    }

    if (!canUseCommandCenter(session, scope, 'tasks.write')) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const priority = typeof body.priority === 'number' ? body.priority : undefined;
    const task = await options.operationalStore.createTask({
      scope,
      title,
      assigneeIds: scope.kind === 'private' ? [session.user.id] : [],
      ...(description ? { description } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(dueAt ? { dueAt } : {}),
    });
    await recordTimeline(options.operationalStore, {
      scope,
      type: 'task.quick_captured',
      actorUserId: session.user.id,
      entityType: 'task',
      entityId: task.id,
      summary: task.title,
    });
    return reply.code(201).send({ kind, task });
  });

  app.get('/v1/today', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.operationalStore) return reply.code(503).send({ error: 'operational_store_unavailable' });

    const query = request.query as { scope?: string };
    const scope = resolveManualScope(session, query.scope);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });

    const canReadToday =
      canUseCommandCenter(session, scope, 'tasks.read') &&
      canUseCommandCenter(session, scope, 'projects.read') &&
      canUseCommandCenter(session, scope, 'alerts.read');
    if (!canReadToday) {
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
