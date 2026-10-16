import { afterEach, describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { Scope, Task, TaskReminderRule } from '@kcc/domain';
import { buildApp } from '../src/application';
import {
  MAX_TASK_REMINDERS,
  normalizeTaskReminderRules,
  type TaskReminderResult,
  type TaskReminderStore,
} from '../src/task-reminder-store';

function task(id: string, scope: Scope, reminderRules: TaskReminderRule[] = []): Task {
  return {
    id,
    scope,
    title: id,
    status: 'todo',
    priority: 50,
    assigneeIds: [],
    reminderRules,
    createdAt: '2026-10-16T00:00:00.000Z',
    updatedAt: '2026-10-16T00:00:00.000Z',
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

class MemoryTaskReminderStore implements TaskReminderStore {
  lastInput?: {
    scope: Scope;
    actorUserId: string;
    taskId: string;
    reminderRules: TaskReminderRule[];
  };

  async ensureIndexes() {}

  async setReminderRules(input: {
    scope: Scope;
    actorUserId: string;
    taskId: string;
    reminderRules: TaskReminderRule[];
  }): Promise<TaskReminderResult> {
    this.lastInput = input;
    if (input.taskId === 'missing') return { ok: false, error: 'task_not_found' };
    if (input.taskId === 'conflict') return { ok: false, error: 'reminder_update_conflict' };
    return {
      ok: true,
      task: task(input.taskId, input.scope, input.reminderRules),
    };
  }
}

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function createApp(store = new MemoryTaskReminderStore()) {
  const app = buildApp({
    logger: false,
    authProvider: new TestAuthProvider(),
    taskReminderStore: store,
  });
  apps.push(app);
  return { app, store };
}

const headers = { authorization: 'Bearer admin', 'content-type': 'application/json' };

describe('task reminder normalization', () => {
  it('canonicalizes and sorts valid ISO-compatible reminder instants', () => {
    expect(
      normalizeTaskReminderRules([
        { kind: 'at', remindAt: '2026-10-18T12:30:00+02:00' },
        { kind: 'at', remindAt: '2026-10-17T08:00:00Z' },
      ]),
    ).toEqual([
      { kind: 'at', remindAt: '2026-10-17T08:00:00.000Z' },
      { kind: 'at', remindAt: '2026-10-18T10:30:00.000Z' },
    ]);
  });

  it('rejects duplicate instants and more than the supported maximum', () => {
    expect(() =>
      normalizeTaskReminderRules([
        { kind: 'at', remindAt: '2026-10-17T08:00:00Z' },
        { kind: 'at', remindAt: '2026-10-17T10:00:00+02:00' },
      ]),
    ).toThrow('task_reminder_duplicate');

    expect(() =>
      normalizeTaskReminderRules(
        Array.from({ length: MAX_TASK_REMINDERS + 1 }, (_, index) => ({
          kind: 'at' as const,
          remindAt: new Date(Date.UTC(2026, 9, 17, index)).toISOString(),
        })),
      ),
    ).toThrow('task_reminder_limit_exceeded');
  });
});

describe('PUT /v1/tasks/:id/reminders', () => {
  it('derives workspace scope and actor from the authenticated session', async () => {
    const { app, store } = createApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/tasks/task-a/reminders',
      headers,
      payload: {
        scope: 'workspace',
        reminderRules: [{ kind: 'at', remindAt: '2026-10-18T12:30:00+02:00' }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().task.reminderRules).toEqual([
      { kind: 'at', remindAt: '2026-10-18T10:30:00.000Z' },
    ]);
    expect(store.lastInput).toEqual({
      scope: { kind: 'workspace', workspaceId: 'workspace-a' },
      actorUserId: 'user-admin',
      taskId: 'task-a',
      reminderRules: [{ kind: 'at', remindAt: '2026-10-18T10:30:00.000Z' }],
    });
  });

  it('derives private ownership and ignores client authority by rejecting unexpected fields', async () => {
    const { app, store } = createApp();
    const privateResponse = await app.inject({
      method: 'PUT',
      url: '/v1/tasks/task-a/reminders',
      headers,
      payload: { scope: 'private', reminderRules: [] },
    });
    expect(privateResponse.statusCode).toBe(200);
    expect(store.lastInput?.scope).toEqual({ kind: 'private', userId: 'user-admin' });

    const authority = await app.inject({
      method: 'PUT',
      url: '/v1/tasks/task-a/reminders',
      headers,
      payload: {
        scope: 'workspace',
        workspaceId: 'workspace-b',
        reminderRules: [],
      },
    });
    expect(authority.statusCode).toBe(400);
    expect(authority.json()).toEqual({ error: 'invalid_task_reminders' });
  });

  it('requires tasks.write and rejects malformed, duplicate or oversized rules', async () => {
    const { app } = createApp();
    const forbidden = await app.inject({
      method: 'PUT',
      url: '/v1/tasks/task-a/reminders',
      headers: { authorization: 'Bearer member', 'content-type': 'application/json' },
      payload: { scope: 'workspace', reminderRules: [] },
    });
    expect(forbidden.statusCode).toBe(403);

    const invalidCases = [
      [{ kind: 'at', remindAt: 'not-a-date' }],
      [
        { kind: 'at', remindAt: '2026-10-17T08:00:00Z' },
        { kind: 'at', remindAt: '2026-10-17T10:00:00+02:00' },
      ],
      Array.from({ length: 11 }, (_, index) => ({
        kind: 'at',
        remindAt: new Date(Date.UTC(2026, 9, 17, index)).toISOString(),
      })),
      [{ kind: 'at', remindAt: '2026-10-17T08:00:00Z', workspaceId: 'workspace-b' }],
    ];

    for (const rules of invalidCases) {
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/tasks/task-a/reminders',
        headers,
        payload: { scope: 'workspace', reminderRules: rules },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_task_reminders' });
    }
  });

  it('maps missing tasks and optimistic conflicts without leaking store internals', async () => {
    const { app } = createApp();
    const missing = await app.inject({
      method: 'PUT',
      url: '/v1/tasks/missing/reminders',
      headers,
      payload: { scope: 'workspace', reminderRules: [] },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'task_not_found' });

    const conflict = await app.inject({
      method: 'PUT',
      url: '/v1/tasks/conflict/reminders',
      headers,
      payload: { scope: 'workspace', reminderRules: [] },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ error: 'reminder_update_conflict' });
  });
});
