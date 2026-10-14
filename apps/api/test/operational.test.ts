import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { Alert, Project, Scope, Task, TodaySummary } from '@kcc/domain';
import type { CreateProjectInput, CreateTaskInput, OperationalStore } from '@kcc/persistence';
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
  ],
  productEntitlements: ['command-center'],
};

const provider: AuthProvider = {
  name: 'test',
  async resolveSession(input) {
    return input.authorization === 'Bearer valid-token' ? session : null;
  },
};

class MemoryOperationalStore implements OperationalStore {
  projects: Project[] = [];
  tasks: Task[] = [];
  alerts: Alert[] = [];

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
    return this.projects.filter((project) => JSON.stringify(project.scope) === JSON.stringify(scope));
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
    return this.tasks.filter((task) => JSON.stringify(task.scope) === JSON.stringify(scope));
  }

  async listAlerts(scope: Scope): Promise<Alert[]> {
    return this.alerts.filter((alert) => JSON.stringify(alert.scope) === JSON.stringify(scope));
  }

  async getTodaySummary(scope: Scope): Promise<TodaySummary> {
    return {
      openTasks: (await this.listTasks(scope)).length,
      dueToday: 0,
      blockedTasks: 0,
      openAlerts: (await this.listAlerts(scope)).length,
      urgentAlerts: 0,
      activeProjects: (await this.listProjects(scope)).length,
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
});
