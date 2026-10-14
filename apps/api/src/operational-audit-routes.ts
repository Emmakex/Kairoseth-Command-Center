import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize } from '@kcc/auth';
import type { AuthProvider, Capability, SessionContext } from '@kcc/auth';
import type {
  AlertSeverity,
  AlertStatus,
  MilestoneStatus,
  ProjectStatus,
  Scope,
  TaskStatus,
} from '@kcc/domain';
import type { OperationalAuditStore } from './operational-audit-store';

const PROJECT_STATUSES: readonly ProjectStatus[] = ['planned', 'active', 'blocked', 'done', 'archived'];
const TASK_STATUSES: readonly TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'];
const ALERT_SEVERITIES: readonly AlertSeverity[] = ['info', 'warning', 'urgent', 'critical'];
const ALERT_STATUSES: readonly AlertStatus[] = ['open', 'acknowledged', 'resolved', 'dismissed'];
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

function canUse(
  session: SessionContext,
  scope: Scope,
  capability: Capability,
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

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : null;
}

const mutationRoutes = new Set([
  'POST /v1/projects',
  'PATCH /v1/projects/:id/status',
  'POST /v1/tasks',
  'PATCH /v1/tasks/:id/status',
  'POST /v1/alerts',
  'PATCH /v1/alerts/:id/status',
  'POST /v1/quick-capture',
  'POST /v1/decisions',
  'POST /v1/milestones',
  'PATCH /v1/milestones/:id/status',
]);

export function registerOperationalAuditRoutes(
  app: FastifyInstance,
  options: { authProvider?: AuthProvider; auditStore?: OperationalAuditStore },
): void {
  if (!options.auditStore) return;

  app.addHook('preHandler', async (request, reply) => {
    const routeKey = `${request.method} ${request.routeOptions.url}`;
    if (!mutationRoutes.has(routeKey)) return;

    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const params = request.params as { id?: string };

    if (routeKey === 'POST /v1/projects') {
      const scope = resolveManualScope(session, body.scope);
      if (!scope) return reply.code(400).send({ error: 'workspace_required' });
      if (!canUse(session, scope, 'projects.write')) return reply.code(403).send({ error: 'forbidden' });
      const name = nonEmptyString(body.name, 160);
      if (!name) return reply.code(400).send({ error: 'invalid_name' });
      const dueAt = body.dueAt === undefined ? undefined : validIsoDate(body.dueAt);
      if (body.dueAt !== undefined && !dueAt) return reply.code(400).send({ error: 'invalid_due_at' });
      const description = optionalString(body.description, 4000);
      const project = await options.auditStore.createProject({
        scope,
        actorUserId: session.user.id,
        eventType: 'project.created',
        name,
        ...(description ? { description } : {}),
        ...(dueAt ? { dueAt } : {}),
      });
      return reply.code(201).send({ project });
    }

    if (routeKey === 'PATCH /v1/projects/:id/status') {
      const scope = resolveManualScope(session, body.scope);
      const projectId = nonEmptyString(params.id, 100);
      const status = enumValue(body.status, PROJECT_STATUSES);
      if (!projectId) return reply.code(400).send({ error: 'invalid_project_id' });
      if (!scope) return reply.code(400).send({ error: 'workspace_required' });
      if (!status) return reply.code(400).send({ error: 'invalid_status' });
      if (body.progress !== undefined && typeof body.progress !== 'number') {
        return reply.code(400).send({ error: 'invalid_progress' });
      }
      if (!canUse(session, scope, 'projects.write')) return reply.code(403).send({ error: 'forbidden' });
      const project = await options.auditStore.updateProjectStatus({
        scope,
        actorUserId: session.user.id,
        projectId,
        status,
        ...(typeof body.progress === 'number' ? { progress: body.progress } : {}),
      });
      if (!project) return reply.code(404).send({ error: 'project_not_found' });
      return reply.send({ project });
    }

    if (routeKey === 'POST /v1/tasks') {
      const scope = resolveManualScope(session, body.scope);
      if (!scope) return reply.code(400).send({ error: 'workspace_required' });
      if (!canUse(session, scope, 'tasks.write')) return reply.code(403).send({ error: 'forbidden' });
      const title = nonEmptyString(body.title, 240);
      if (!title) return reply.code(400).send({ error: 'invalid_title' });
      const dueAt = body.dueAt === undefined ? undefined : validIsoDate(body.dueAt);
      if (body.dueAt !== undefined && !dueAt) return reply.code(400).send({ error: 'invalid_due_at' });
      const priority = typeof body.priority === 'number' ? body.priority : undefined;
      const projectId = optionalString(body.projectId, 100);
      const description = optionalString(body.description, 8000);
      const task = await options.auditStore.createTask({
        scope,
        actorUserId: session.user.id,
        eventType: 'task.created',
        title,
        ...(description ? { description } : {}),
        ...(projectId ? { projectId } : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(dueAt ? { dueAt } : {}),
      });
      return reply.code(201).send({ task });
    }

    if (routeKey === 'PATCH /v1/tasks/:id/status') {
      const scope = resolveManualScope(session, body.scope);
      const taskId = nonEmptyString(params.id, 100);
      const status = enumValue(body.status, TASK_STATUSES);
      if (!taskId) return reply.code(400).send({ error: 'invalid_task_id' });
      if (!scope) return reply.code(400).send({ error: 'workspace_required' });
      if (!status) return reply.code(400).send({ error: 'invalid_status' });
      if (!canUse(session, scope, 'tasks.write')) return reply.code(403).send({ error: 'forbidden' });
      const task = await options.auditStore.updateTaskStatus({
        scope,
        actorUserId: session.user.id,
        taskId,
        status,
      });
      if (!task) return reply.code(404).send({ error: 'task_not_found' });
      return reply.send({ task });
    }

    if (routeKey === 'POST /v1/alerts') {
      const scope = resolveManualScope(session, body.scope);
      const title = nonEmptyString(body.title, 240);
      const severity = enumValue(body.severity, ALERT_SEVERITIES);
      if (!scope) return reply.code(400).send({ error: 'workspace_required' });
      if (!title) return reply.code(400).send({ error: 'invalid_title' });
      if (!severity) return reply.code(400).send({ error: 'invalid_severity' });
      if (!canUse(session, scope, 'alerts.manage')) return reply.code(403).send({ error: 'forbidden' });
      const message = optionalString(body.message, 8000);
      const projectId = optionalString(body.projectId, 100);
      const fingerprint = optionalString(body.fingerprint, 200);
      const alert = await options.auditStore.createAlert({
        scope,
        actorUserId: session.user.id,
        title,
        severity,
        ...(message ? { message } : {}),
        ...(projectId ? { projectId } : {}),
        ...(fingerprint ? { fingerprint } : {}),
      });
      return reply.code(201).send({ alert });
    }

    if (routeKey === 'PATCH /v1/alerts/:id/status') {
      const scope = resolveManualScope(session, body.scope);
      const alertId = nonEmptyString(params.id, 100);
      const status = enumValue(body.status, ALERT_STATUSES);
      if (!alertId) return reply.code(400).send({ error: 'invalid_alert_id' });
      if (!scope) return reply.code(400).send({ error: 'workspace_required' });
      if (!status) return reply.code(400).send({ error: 'invalid_status' });
      if (!canUse(session, scope, 'alerts.manage')) return reply.code(403).send({ error: 'forbidden' });
      const alert = await options.auditStore.updateAlertStatus({
        scope,
        actorUserId: session.user.id,
        alertId,
        status,
      });
      if (!alert) return reply.code(404).send({ error: 'alert_not_found' });
      return reply.send({ alert });
    }

    if (routeKey === 'POST /v1/quick-capture') {
      const scope = resolveManualScope(session, body.scope);
      const kind = body.kind === 'project' || body.kind === 'task' ? body.kind : null;
      const title = nonEmptyString(body.title, kind === 'project' ? 160 : 240);
      if (!scope) return reply.code(400).send({ error: 'workspace_required' });
      if (!kind) return reply.code(400).send({ error: 'invalid_kind' });
      if (!title) return reply.code(400).send({ error: 'invalid_title' });
      const dueAt = body.dueAt === undefined ? undefined : validIsoDate(body.dueAt);
      if (body.dueAt !== undefined && !dueAt) return reply.code(400).send({ error: 'invalid_due_at' });
      const description = optionalString(body.description, kind === 'project' ? 4000 : 8000);

      if (kind === 'project') {
        if (!canUse(session, scope, 'projects.write')) return reply.code(403).send({ error: 'forbidden' });
        const project = await options.auditStore.createProject({
          scope,
          actorUserId: session.user.id,
          eventType: 'project.quick_captured',
          name: title,
          ...(description ? { description } : {}),
          ...(dueAt ? { dueAt } : {}),
        });
        return reply.code(201).send({ kind, project });
      }

      if (!canUse(session, scope, 'tasks.write')) return reply.code(403).send({ error: 'forbidden' });
      const priority = typeof body.priority === 'number' ? body.priority : undefined;
      const task = await options.auditStore.createTask({
        scope,
        actorUserId: session.user.id,
        eventType: 'task.quick_captured',
        title,
        ...(description ? { description } : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(dueAt ? { dueAt } : {}),
      });
      return reply.code(201).send({ kind, task });
    }

    if (routeKey === 'POST /v1/decisions') {
      if (body.scope === 'private') return reply.code(400).send({ error: 'workspace_only' });
      const scope = session.activeWorkspaceId
        ? ({ kind: 'workspace', workspaceId: session.activeWorkspaceId } as const)
        : null;
      if (!scope) return reply.code(400).send({ error: 'workspace_required' });
      if (!canUse(session, scope, 'decisions.write')) return reply.code(403).send({ error: 'forbidden' });
      const title = nonEmptyString(body.title, 240);
      const decision = nonEmptyString(body.decision, 8000);
      if (!title) return reply.code(400).send({ error: 'invalid_title' });
      if (!decision) return reply.code(400).send({ error: 'invalid_decision' });
      const context = optionalString(body.context, 8000);
      const madeAt = body.madeAt === undefined ? undefined : validIsoDate(body.madeAt);
      if (body.madeAt !== undefined && !madeAt) return reply.code(400).send({ error: 'invalid_made_at' });
      const created = await options.auditStore.createSimpleDecision({
        scope,
        actorUserId: session.user.id,
        title,
        decision,
        ...(context ? { context } : {}),
        ...(madeAt ? { madeAt } : {}),
      });
      return reply.code(201).send({ decision: created });
    }

    if (routeKey === 'POST /v1/milestones') {
      const scope = resolveManualScope(session, body.scope);
      if (!scope) return reply.code(400).send({ error: 'workspace_required' });
      if (!canUse(session, scope, 'milestones.write')) return reply.code(403).send({ error: 'forbidden' });
      const projectId = nonEmptyString(body.projectId, 100);
      const title = nonEmptyString(body.title, 240);
      if (!projectId) return reply.code(400).send({ error: 'invalid_project_id' });
      if (!title) return reply.code(400).send({ error: 'invalid_title' });
      if (typeof body.weight !== 'number' || !Number.isFinite(body.weight) || body.weight <= 0) {
        return reply.code(400).send({ error: 'invalid_weight' });
      }
      const dueAt = body.dueAt === undefined ? undefined : validIsoDate(body.dueAt);
      if (body.dueAt !== undefined && !dueAt) return reply.code(400).send({ error: 'invalid_due_at' });
      const result = await options.auditStore.createMilestone({
        scope,
        actorUserId: session.user.id,
        projectId,
        title,
        weight: body.weight,
        ...(dueAt ? { dueAt } : {}),
      });
      if (!result) return reply.code(404).send({ error: 'project_not_found' });
      return reply.code(201).send(result);
    }

    if (routeKey === 'PATCH /v1/milestones/:id/status') {
      const scope = resolveManualScope(session, body.scope);
      const milestoneId = nonEmptyString(params.id, 100);
      const status = enumValue(body.status, MILESTONE_STATUSES);
      if (!milestoneId) return reply.code(400).send({ error: 'invalid_milestone_id' });
      if (!scope) return reply.code(400).send({ error: 'workspace_required' });
      if (!status) return reply.code(400).send({ error: 'invalid_status' });
      if (!canUse(session, scope, 'milestones.write')) return reply.code(403).send({ error: 'forbidden' });
      const result = await options.auditStore.updateMilestoneStatus({
        scope,
        actorUserId: session.user.id,
        milestoneId,
        status,
      });
      if (!result) return reply.code(404).send({ error: 'milestone_not_found' });
      return reply.send(result);
    }
  });
}
