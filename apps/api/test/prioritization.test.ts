import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { Alert, Scope, Task } from '@kcc/domain';
import { rankOperationalPriorities } from '@kcc/domain';
import type { OperationalStore } from '@kcc/persistence';
import { buildApp } from '../src/application';

const range = {
  start: '2026-10-16T00:00:00.000Z',
  end: '2026-10-17T00:00:00.000Z',
};

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    scope: { kind: 'workspace', workspaceId: 'workspace-a' },
    title: 'Prepare release',
    status: 'todo',
    priority: 50,
    assigneeIds: [],
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

function alert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'alert-1',
    scope: { kind: 'workspace', workspaceId: 'workspace-a' },
    title: 'CI failure',
    severity: 'urgent',
    status: 'open',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('rankOperationalPriorities', () => {
  it('combines manual priority, blocked state and overdue work with explicit contributions', () => {
    const [item] = rankOperationalPriorities({
      tasks: [
        task({
          priority: 80,
          status: 'blocked',
          dueAt: '2026-10-15T10:00:00.000Z',
        }),
      ],
      alerts: [],
      range,
    });

    expect(item).toEqual({
      kind: 'task',
      id: 'task-1',
      title: 'Prepare release',
      score: 100,
      status: 'blocked',
      dueAt: '2026-10-15T10:00:00.000Z',
      reasons: [
        { code: 'task.manual_priority', contribution: 40, value: 80 },
        { code: 'task.blocked', contribution: 30 },
        { code: 'task.overdue', contribution: 35 },
      ],
    });
  });

  it('ranks critical and urgent alerts alongside tasks deterministically', () => {
    const priorities = rankOperationalPriorities({
      tasks: [task({ id: 'task-high', priority: 100 })],
      alerts: [
        alert({ id: 'alert-warning', severity: 'warning' }),
        alert({ id: 'alert-critical', severity: 'critical' }),
      ],
      range,
    });

    expect(priorities.map((item) => [item.id, item.score])).toEqual([
      ['alert-critical', 100],
      ['alert-warning', 60],
      ['task-high', 50],
    ]);
    expect(priorities[0]?.reasons).toEqual([
      { code: 'alert.severity', contribution: 100, value: 'critical' },
    ]);
  });

  it('adds a due-today reason but excludes completed tasks and resolved alerts', () => {
    const priorities = rankOperationalPriorities({
      tasks: [
        task({ id: 'today', priority: 40, dueAt: '2026-10-16T12:00:00.000Z' }),
        task({ id: 'done', status: 'done', priority: 100 }),
      ],
      alerts: [alert({ id: 'resolved', status: 'resolved', severity: 'critical' })],
      range,
    });

    expect(priorities).toHaveLength(1);
    expect(priorities[0]).toMatchObject({ id: 'today', score: 40 });
    expect(priorities[0]?.reasons).toContainEqual({ code: 'task.due_today', contribution: 20 });
  });
});

class TestAuthProvider implements AuthProvider {
  readonly name = 'test';

  async resolveSession(): Promise<SessionContext> {
    return {
      user: {
        id: 'user-a',
        email: 'user@example.test',
        displayName: 'User',
        locale: 'en',
        timezone: 'UTC',
      },
      activeWorkspaceId: 'workspace-a',
      membershipId: 'membership-a',
      role: 'admin',
      capabilities: ['tasks.read', 'alerts.read'],
      productEntitlements: ['command-center'],
    };
  }
}

function priorityStore(): OperationalStore {
  return {
    async listTasks(scope: Scope) {
      return [task({ scope, id: 'api-task', priority: 100 })];
    },
    async listAlerts(scope: Scope) {
      return [alert({ scope, id: 'api-alert', severity: 'urgent' })];
    },
  } as unknown as OperationalStore;
}

describe('GET /v1/priorities', () => {
  it('uses authenticated workspace scope and returns explainable ranking', async () => {
    const app = buildApp({
      logger: false,
      authProvider: new TestAuthProvider(),
      operationalStore: priorityStore(),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/priorities?scope=workspace&limit=2',
      headers: { authorization: 'Bearer test' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      scope: 'workspace',
      priorities: [
        {
          kind: 'alert',
          id: 'api-alert',
          score: 90,
          reasons: [{ code: 'alert.severity', contribution: 90, value: 'urgent' }],
        },
        {
          kind: 'task',
          id: 'api-task',
          score: 50,
        },
      ],
    });
    await app.close();
  });

  it('rejects invalid limits before ranking', async () => {
    const app = buildApp({
      logger: false,
      authProvider: new TestAuthProvider(),
      operationalStore: priorityStore(),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/priorities?limit=100',
      headers: { authorization: 'Bearer test' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_limit' });
    await app.close();
  });
});
