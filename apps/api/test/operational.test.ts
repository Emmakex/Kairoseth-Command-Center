import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type {
  Alert,
  AlertStatus,
  Decision,
  Project,
  ProjectStatus,
  Scope,
  Task,
  TaskStatus,
  TimelineEvent,
  TodaySummary,
} from '@kcc/domain';
import type {
  AppendTimelineInput,
  CreateAlertInput,
  CreateDecisionInput,
  CreateProjectInput,
  CreateTaskInput,
  OperationalStore,
} from '@kcc/persistence';
import { buildApp } from '../src/app';

const session: SessionContext = {
  user: {
    id: 'user-1',
    email: 'user@example.com',
    displayName: 'User One',
    locale: 'es',
    timezone: 'Europe/Madrid',
  },
  activeWorkspaceId: 'workspace-a',
  membershipId: 'membership-1',
  role: 'admin',
  capabilities: [
    'projects.read',
    'projects.write',
    'tasks.read',
    'tasks.write',
    'alerts.read',
    'alerts.manage',
    'decisions.read',
    'decisions.write',
    'timeline.read',
  ],
  productEntitlements: ['command-center'],
};

const provider: AuthProvider = {
  name: 'test',
  async resolveSession(input) {
    return input.authorization === 'Bearer valid-token' ? session : null;
  },
};

const sameScope = (left: Scope, right: Scope) => JSON.stringify(left) === JSON.stringify(right);

class MemoryOperationalStore implements OperationalStore {
  projects: Project[] = [];
  tasks: Task[] = [];
  alerts: Alert[] = [];
  decisions: Decision[] = [];
  timeline: TimelineEvent[] = [];

  async createProject(input: CreateProjectInput): Promise<Project> {
    const project: Project = {
      id: `project-${this.projects.length + 1}`,
      scope: input.scope,
      name: input.name,
      status: 'active',
      progress: 0,
      createdAt: '2026-10-14T00:00:00.000Z',
      updatedAt: '2026-10-14T00:00:00.000Z',
      ...(input.description ? { description: input.description } : {}),
      ...(input.ownerUserId ? { ownerUserId: input.ownerUserId } : {}),
      ...(input.dueAt ? { dueAt: input.dueAt } : {}),
    };
    this.projects.push(project);
    return project;
  }

  async listProjects(scope: Scope): Promise<Project[]> {
    return this.projects.filter((project) => sameScope(project.scope, scope));
  }

  async updateProjectStatus(
    scope: Scope,
    projectId: string,
    status: ProjectStatus,
    progress?: number,
  ): Promise<Project | null> {
    const project = this.projects.find((candidate) => candidate.id === projectId && sameScope(candidate.scope, scope));
    if (!project) return null;
    project.status = status;
    if (status === 'done') project.progress = 100;
    else if (progress !== undefined) project.progress = Math.min(100, Math.max(0, Math.round(progress)));
    project.updatedAt = '2026-10-14T01:00:00.000Z';
    return project;
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    const task: Task = {
      id: `task-${this.tasks.length + 1}`,
      scope: input.scope,
      title: input.title,
      status: 'todo',
      priority: input.priority ?? 50,
      assigneeIds: input.assigneeIds ?? [],
      createdAt: '2026-10-14T00:00:00.000Z',
      updatedAt: '2026-10-14T00:00:00.000Z',
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.dueAt ? { dueAt: input.dueAt } : {}),
    };
    this.tasks.push(task);
    return task;
  }

  async listTasks(scope: Scope): Promise<Task[]> {
    return this.tasks.filter((task) => sameScope(task.scope, scope));
  }

  async updateTaskStatus(scope: Scope, taskId: string, status: TaskStatus): Promise<Task | null> {
    const task = this.tasks.find((candidate) => candidate.id === taskId && sameScope(candidate.scope, scope));
    if (!task) return null;
    task.status = status;
    task.updatedAt = '2026-10-14T01:00:00.000Z';
    if (status === 'done') task.completedAt = '2026-10-14T01:00:00.000Z';
    else delete task.completedAt;
    return task;
  }

  async createAlert(input: CreateAlertInput): Promise<Alert> {
    const alert: Alert = {
      id: `alert-${this.alerts.length + 1}`,
      scope: input.scope,
      title: input.title,
      severity: input.severity,
      status: 'open',
      createdAt: '2026-10-14T00:00:00.000Z',
      updatedAt: '2026-10-14T00:00:00.000Z',
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.message ? { message: input.message } : {}),
      ...(input.fingerprint ? { fingerprint: input.fingerprint } : {}),
    };
    this.alerts.push(alert);
    return alert;
  }

  async listAlerts(scope: Scope): Promise<Alert[]> {
    return this.alerts.filter((alert) => sameScope(alert.scope, scope));
  }

  async updateAlertStatus(scope: Scope, alertId: string, status: AlertStatus): Promise<Alert | null> {
    const alert = this.alerts.find((candidate) => candidate.id === alertId && sameScope(candidate.scope, scope));
    if (!alert) return null;
    alert.status = status;
    alert.updatedAt = '2026-10-14T01:00:00.000Z';
    if (status === 'acknowledged') {
      alert.acknowledgedAt = '2026-10-14T01:00:00.000Z';
      delete alert.resolvedAt;
    } else if (status === 'resolved') {
      alert.resolvedAt = '2026-10-14T01:00:00.000Z';
    } else {
      delete alert.acknowledgedAt;
      delete alert.resolvedAt;
    }
    return alert;
  }

  async createDecision(input: CreateDecisionInput): Promise<Decision> {
    const decision: Decision = {
      id: `decision-${this.decisions.length + 1}`,
      scope: input.scope,
      title: input.title,
      decision: input.decision,
      status: 'active',
      madeBy: input.madeBy,
      madeAt: input.madeAt ?? '2026-10-14T00:00:00.000Z',
      createdAt: '2026-10-14T00:00:00.000Z',
      updatedAt: '2026-10-14T00:00:00.000Z',
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.context ? { context: input.context } : {}),
      ...(input.supersedesId ? { supersedesId: input.supersedesId } : {}),
    };
    this.decisions.push(decision);
    return decision;
  }

  async listDecisions(scope: Extract<Scope, { kind: 'workspace' }>): Promise<Decision[]> {
    return this.decisions.filter((decision) => sameScope(decision.scope, scope));
  }

  async appendTimeline(input: AppendTimelineInput): Promise<TimelineEvent> {
    const event: TimelineEvent = {
      id: `event-${this.timeline.length + 1}`,
      scope: input.scope,
      type: input.type,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      source: input.source,
      occurredAt: input.occurredAt ?? '2026-10-14T00:00:00.000Z',
      metadata: input.metadata ?? {},
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    };
    this.timeline.push(event);
    return event;
  }

  async listTimeline(scope: Scope): Promise<TimelineEvent[]> {
    return this.timeline.filter((event) => sameScope(event.scope, scope));
  }

  async getTodaySummary(scope: Scope): Promise<TodaySummary> {
    const tasks = await this.listTasks(scope);
    const alerts = await this.listAlerts(scope);
    const projects = await this.listProjects(scope);
    return {
      openTasks: tasks.filter((task) => task.status !== 'done' && task.status !== 'cancelled').length,
      dueToday: 0,
      blockedTasks: tasks.filter((task) => task.status === 'blocked').length,
      openAlerts: alerts.filter((alert) => alert.status === 'open' || alert.status === 'acknowledged').length,
      urgentAlerts: alerts.filter(
        (alert) =>
          (alert.status === 'open' || alert.status === 'acknowledged') &&
          (alert.severity === 'urgent' || alert.severity === 'critical'),
      ).length,
      activeProjects: projects.filter((project) => project.status === 'active' || project.status === 'blocked').length,
    };
  }
}

const authHeaders = { authorization: 'Bearer valid-token' };

describe('operational API', () => {
  it('derives workspace scope from the authenticated session, not a client workspace id', async () => {
    const store = new MemoryOperationalStore();
    const app = buildApp({ authProvider: provider, operationalStore: store });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: authHeaders,
      payload: { name: 'Project A', scope: 'workspace', workspaceId: 'workspace-b' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().project.scope).toEqual({ kind: 'workspace', workspaceId: 'workspace-a' });
    expect(store.timeline[0]?.type).toBe('project.created');
    await app.close();
  });

  it('creates private tasks strictly for the authenticated user', async () => {
    const store = new MemoryOperationalStore();
    const app = buildApp({ authProvider: provider, operationalStore: store });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: authHeaders,
      payload: { title: 'Personal reminder', scope: 'private', userId: 'another-user', priority: 90 },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().task).toMatchObject({
      scope: { kind: 'private', userId: 'user-1' },
      assigneeIds: ['user-1'],
      priority: 90,
    });
    await app.close();
  });

  it('rejects access when Command Center is not entitled', async () => {
    const noEntitlementProvider: AuthProvider = {
      name: 'test-no-entitlement',
      async resolveSession() {
        return { ...session, productEntitlements: [] };
      },
    };
    const app = buildApp({
      authProvider: noEntitlementProvider,
      operationalStore: new MemoryOperationalStore(),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/projects',
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('returns a Today payload for workspace and private scopes independently', async () => {
    const store = new MemoryOperationalStore();
    const app = buildApp({ authProvider: provider, operationalStore: store });

    await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: authHeaders,
      payload: { title: 'Workspace task', scope: 'workspace' },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: authHeaders,
      payload: { title: 'Private task', scope: 'private' },
    });

    const workspaceToday = await app.inject({
      method: 'GET',
      url: '/v1/today?scope=workspace',
      headers: authHeaders,
    });
    const privateToday = await app.inject({
      method: 'GET',
      url: '/v1/today?scope=private',
      headers: authHeaders,
    });

    expect(workspaceToday.statusCode).toBe(200);
    expect(workspaceToday.json()).toMatchObject({ scope: 'workspace', summary: { openTasks: 1 } });
    expect(privateToday.statusCode).toBe(200);
    expect(privateToday.json()).toMatchObject({ scope: 'private', summary: { openTasks: 1 } });
    await app.close();
  });

  it('validates names and due dates before persistence', async () => {
    const app = buildApp({
      authProvider: provider,
      operationalStore: new MemoryOperationalStore(),
    });

    const invalidTitle = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: authHeaders,
      payload: { title: '   ', scope: 'workspace' },
    });
    const invalidDate = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: authHeaders,
      payload: { name: 'Project', dueAt: 'not-a-date', scope: 'workspace' },
    });

    expect(invalidTitle.statusCode).toBe(400);
    expect(invalidDate.statusCode).toBe(400);
    await app.close();
  });

  it('keeps task status mutations inside the requested authenticated scope', async () => {
    const store = new MemoryOperationalStore();
    const app = buildApp({ authProvider: provider, operationalStore: store });

    const created = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: authHeaders,
      payload: { title: 'Private mutation target', scope: 'private' },
    });
    const taskId = created.json().task.id as string;

    const wrongScope = await app.inject({
      method: 'PATCH',
      url: `/v1/tasks/${taskId}/status`,
      headers: authHeaders,
      payload: { scope: 'workspace', workspaceId: 'workspace-b', status: 'done' },
    });
    expect(wrongScope.statusCode).toBe(404);
    expect(store.tasks[0]?.status).toBe('todo');

    const correctScope = await app.inject({
      method: 'PATCH',
      url: `/v1/tasks/${taskId}/status`,
      headers: authHeaders,
      payload: { scope: 'private', userId: 'another-user', status: 'done' },
    });
    expect(correctScope.statusCode).toBe(200);
    expect(correctScope.json().task).toMatchObject({ status: 'done', completedAt: expect.any(String) });
    await app.close();
  });

  it('completes projects at 100 percent and records the status transition', async () => {
    const store = new MemoryOperationalStore();
    const app = buildApp({ authProvider: provider, operationalStore: store });
    const created = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: authHeaders,
      payload: { name: 'Finish me', scope: 'workspace' },
    });
    const projectId = created.json().project.id as string;

    const completed = await app.inject({
      method: 'PATCH',
      url: `/v1/projects/${projectId}/status`,
      headers: authHeaders,
      payload: { scope: 'workspace', status: 'done', progress: 72 },
    });

    expect(completed.statusCode).toBe(200);
    expect(completed.json().project).toMatchObject({ status: 'done', progress: 100 });
    expect(store.timeline.some((event) => event.type === 'project.status_changed')).toBe(true);
    await app.close();
  });

  it('supports alert creation, acknowledgement and resolution with audit events', async () => {
    const store = new MemoryOperationalStore();
    const app = buildApp({ authProvider: provider, operationalStore: store });

    const created = await app.inject({
      method: 'POST',
      url: '/v1/alerts',
      headers: authHeaders,
      payload: { scope: 'workspace', title: 'Runner degraded', severity: 'urgent' },
    });
    expect(created.statusCode).toBe(201);
    const alertId = created.json().alert.id as string;

    const acknowledged = await app.inject({
      method: 'PATCH',
      url: `/v1/alerts/${alertId}/status`,
      headers: authHeaders,
      payload: { scope: 'workspace', status: 'acknowledged' },
    });
    expect(acknowledged.statusCode).toBe(200);
    expect(acknowledged.json().alert.acknowledgedAt).toBeTruthy();

    const resolved = await app.inject({
      method: 'PATCH',
      url: `/v1/alerts/${alertId}/status`,
      headers: authHeaders,
      payload: { scope: 'workspace', status: 'resolved' },
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json().alert).toMatchObject({ status: 'resolved', resolvedAt: expect.any(String) });
    expect(store.timeline.filter((event) => event.entityType === 'alert')).toHaveLength(3);
    await app.close();
  });

  it('keeps decisions workspace-only and attributes them to the authenticated user', async () => {
    const store = new MemoryOperationalStore();
    const app = buildApp({ authProvider: provider, operationalStore: store });

    const privateAttempt = await app.inject({
      method: 'POST',
      url: '/v1/decisions',
      headers: authHeaders,
      payload: { scope: 'private', title: 'Hidden', decision: 'No' },
    });
    expect(privateAttempt.statusCode).toBe(400);

    const created = await app.inject({
      method: 'POST',
      url: '/v1/decisions',
      headers: authHeaders,
      payload: { title: 'Release policy', decision: 'Require green Docker smoke before merge' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().decision).toMatchObject({
      scope: { kind: 'workspace', workspaceId: 'workspace-a' },
      madeBy: 'user-1',
      status: 'active',
    });

    const listed = await app.inject({ method: 'GET', url: '/v1/decisions', headers: authHeaders });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().decisions).toHaveLength(1);
    await app.close();
  });

  it('quick-captures a private task and exposes only its private timeline', async () => {
    const store = new MemoryOperationalStore();
    const app = buildApp({ authProvider: provider, operationalStore: store });

    const capture = await app.inject({
      method: 'POST',
      url: '/v1/quick-capture',
      headers: authHeaders,
      payload: { scope: 'private', kind: 'task', title: 'Call supplier', priority: 85 },
    });
    expect(capture.statusCode).toBe(201);
    expect(capture.json().task).toMatchObject({
      scope: { kind: 'private', userId: 'user-1' },
      assigneeIds: ['user-1'],
    });

    const privateTimeline = await app.inject({
      method: 'GET',
      url: '/v1/timeline?scope=private',
      headers: authHeaders,
    });
    const workspaceTimeline = await app.inject({
      method: 'GET',
      url: '/v1/timeline?scope=workspace',
      headers: authHeaders,
    });
    expect(privateTimeline.statusCode).toBe(200);
    expect(privateTimeline.json().events).toMatchObject([{ type: 'task.quick_captured' }]);
    expect(workspaceTimeline.json().events).toHaveLength(0);
    await app.close();
  });
});
