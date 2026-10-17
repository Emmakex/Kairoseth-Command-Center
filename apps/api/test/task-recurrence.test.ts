import { afterEach, describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { Scope, Task, TaskRecurrenceRule } from '@kcc/domain';
import { buildApp } from '../src/application';
import {
  MAX_TASK_RECURRENCE_DAYS,
  MIN_TASK_RECURRENCE_DAYS,
  normalizeTaskRecurrenceRule,
  type TaskRecurrenceResult,
  type TaskRecurrenceStore,
} from '../src/task-recurrence-store';

function task(
  id: string,
  scope: Scope,
  recurrenceRule: TaskRecurrenceRule | null = null,
): Task {
  return {
    id,
    scope,
    title: id,
    status: 'todo',
    priority: 50,
    assigneeIds: [],
    ...(recurrenceRule ? { recurrenceRule } : {}),
    dueAt: '2026-10-20T09:00:00.000Z',
    createdAt: '2026-10-17T00:00:00.000Z',
    updatedAt: '2026-10-17T00:00:00.000Z',
  };
}

class TestAuthProvider implements AuthProvider {
  readonly name = 'test';

  async resolveSession(input: { authorization?: string }): Promise<SessionContext | null> {
    const token = input.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return null;
    const canWrite = token !== 'member';
    return {
      user: {
        id: `user-${token}`,
        email: `${token}@example.test`,
        displayName: token,
        locale: 'en',
        timezone: 'UTC',
      },
      activeWorkspaceId: 'workspace-a',
      membershipId: `membership-${token}`,
      role: canWrite ? 'admin' : 'member',
      capabilities: canWrite ? ['tasks.write'] : [],
      productEntitlements: ['command-center'],
    };
  }
}

class MemoryTaskRecurrenceStore implements TaskRecurrenceStore {
  lastInput?: {
    scope: Scope;
    actorUserId: string;
    taskId: string;
    recurrenceRule: TaskRecurrenceRule | null;
  };

  async ensureIndexes() {}

  async setRecurrenceRule(input: {
    scope: Scope;
    actorUserId: string;
    taskId: string;
    recurrenceRule: TaskRecurrenceRule | null;
  }): Promise<TaskRecurrenceResult> {
    this.lastInput = input;
    if (input.taskId === 'missing') return { ok: false, error: 'task_not_found' };
    if (input.taskId === 'no-due') {
      return { ok: false, error: 'task_recurrence_requires_due_at' };
    }
    if (input.taskId === 'conflict') {
      return { ok: false, error: 'recurrence_update_conflict' };
    }
    return {
      ok: true,
      task: task(input.taskId, input.scope, input.recurrenceRule),
    };
  }
}

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function createApp(store = new MemoryTaskRecurrenceStore()) {
  const app = buildApp({
    logger: false,
    authProvider: new TestAuthProvider(),
    taskRecurrenceStore: store,
  });
  apps.push(app);
  return { app, store };
}

const headers = { authorization: 'Bearer admin', 'content-type': 'application/json' };

describe('task recurrence normalization', () => {
  it('accepts bounded whole-day intervals and null clearing', () => {
    expect(normalizeTaskRecurrenceRule({ kind: 'interval_days', intervalDays: 7 })).toEqual({
      kind: 'interval_days',
      intervalDays: 7,
    });
    expect(normalizeTaskRecurrenceRule(null)).toBeNull();
  });

  it('rejects out-of-range and fractional intervals', () => {
    for (const intervalDays of [
      MIN_TASK_RECURRENCE_DAYS - 1,
      MAX_TASK_RECURRENCE_DAYS + 1,
      1.5,
    ]) {
      expect(() =>
        normalizeTaskRecurrenceRule({ kind: 'interval_days', intervalDays }),
      ).toThrow('task_recurrence_invalid');
    }
  });
});

describe('PUT /v1/tasks/:id/recurrence', () => {
  it('derives workspace scope and actor from the authenticated session', async () => {
    const { app, store } = createApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/tasks/task-a/recurrence',
      headers,
      payload: {
        scope: 'workspace',
        recurrenceRule: { kind: 'interval_days', intervalDays: 7 },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().task.recurrenceRule).toEqual({
      kind: 'interval_days',
      intervalDays: 7,
    });
    expect(store.lastInput).toEqual({
      scope: { kind: 'workspace', workspaceId: 'workspace-a' },
      actorUserId: 'user-admin',
      taskId: 'task-a',
      recurrenceRule: { kind: 'interval_days', intervalDays: 7 },
    });
  });

  it('supports private clearing and rejects client authority fields', async () => {
    const { app, store } = createApp();
    const clearResponse = await app.inject({
      method: 'PUT',
      url: '/v1/tasks/task-a/recurrence',
      headers,
      payload: { scope: 'private', recurrenceRule: null },
    });
    expect(clearResponse.statusCode).toBe(200);
    expect(store.lastInput).toEqual({
      scope: { kind: 'private', userId: 'user-admin' },
      actorUserId: 'user-admin',
      taskId: 'task-a',
      recurrenceRule: null,
    });

    const authority = await app.inject({
      method: 'PUT',
      url: '/v1/tasks/task-a/recurrence',
      headers,
      payload: {
        scope: 'workspace',
        workspaceId: 'workspace-b',
        recurrenceRule: { kind: 'interval_days', intervalDays: 7 },
      },
    });
    expect(authority.statusCode).toBe(400);
    expect(authority.json()).toEqual({ error: 'invalid_task_recurrence' });
  });

  it('requires tasks.write and rejects malformed recurrence rules', async () => {
    const { app } = createApp();
    const forbidden = await app.inject({
      method: 'PUT',
      url: '/v1/tasks/task-a/recurrence',
      headers: { authorization: 'Bearer member', 'content-type': 'application/json' },
      payload: {
        scope: 'workspace',
        recurrenceRule: { kind: 'interval_days', intervalDays: 7 },
      },
    });
    expect(forbidden.statusCode).toBe(403);

    const invalidRules = [
      undefined,
      { kind: 'interval_days', intervalDays: 0 },
      { kind: 'interval_days', intervalDays: 366 },
      { kind: 'interval_days', intervalDays: 1.5 },
      { kind: 'weekly', intervalDays: 7 },
      { kind: 'interval_days', intervalDays: 7, workspaceId: 'workspace-b' },
    ];

    for (const rule of invalidRules) {
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/tasks/task-a/recurrence',
        headers,
        payload: { scope: 'workspace', recurrenceRule: rule },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_task_recurrence' });
    }
  });

  it('maps missing tasks, missing due-date anchors and optimistic conflicts', async () => {
    const { app } = createApp();
    const rule = { kind: 'interval_days', intervalDays: 7 } as const;

    const missing = await app.inject({
      method: 'PUT',
      url: '/v1/tasks/missing/recurrence',
      headers,
      payload: { scope: 'workspace', recurrenceRule: rule },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'task_not_found' });

    const noDue = await app.inject({
      method: 'PUT',
      url: '/v1/tasks/no-due/recurrence',
      headers,
      payload: { scope: 'workspace', recurrenceRule: rule },
    });
    expect(noDue.statusCode).toBe(409);
    expect(noDue.json()).toEqual({ error: 'task_recurrence_requires_due_at' });

    const conflict = await app.inject({
      method: 'PUT',
      url: '/v1/tasks/conflict/recurrence',
      headers,
      payload: { scope: 'workspace', recurrenceRule: rule },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ error: 'recurrence_update_conflict' });
  });
});
