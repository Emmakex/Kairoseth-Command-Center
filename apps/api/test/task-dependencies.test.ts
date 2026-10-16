import { afterEach, describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { Scope, Task } from '@kcc/domain';
import { buildApp } from '../src/application';
import {
  hasTaskDependencyCycle,
  type TaskDependencyResult,
  type TaskDependencyStore,
} from '../src/task-dependency-store';

function task(id: string, dependencyIds: string[] = []): Task {
  return {
    id,
    scope: { kind: 'workspace', workspaceId: 'workspace-a' },
    title: id,
    status: 'todo',
    priority: 50,
    assigneeIds: [],
    dependencyIds,
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

class MemoryTaskDependencyStore implements TaskDependencyStore {
  lastInput?: {
    scope: Scope;
    actorUserId: string;
    taskId: string;
    dependencyIds: string[];
  };

  async ensureIndexes() {}

  async setDependencies(input: {
    scope: Scope;
    actorUserId: string;
    taskId: string;
    dependencyIds: string[];
  }): Promise<TaskDependencyResult> {
    this.lastInput = input;
    if (input.taskId === 'missing') return { ok: false, error: 'task_not_found' };
    if (input.dependencyIds.includes('outside')) {
      return { ok: false, error: 'dependency_not_found', dependencyId: 'outside' };
    }
    if (input.dependencyIds.includes(input.taskId)) {
      return { ok: false, error: 'self_dependency', dependencyId: input.taskId };
    }
    if (input.dependencyIds.includes('cycle')) return { ok: false, error: 'dependency_cycle' };
    return {
      ok: true,
      task: {
        ...task(input.taskId, input.dependencyIds),
        scope: input.scope,
      },
    };
  }
}

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function createApp(store = new MemoryTaskDependencyStore()) {
  const app = buildApp({
    logger: false,
    authProvider: new TestAuthProvider(),
    taskDependencyStore: store,
  });
  apps.push(app);
  return { app, store };
}

describe('task dependency graph', () => {
  it('detects direct and indirect cycles while accepting an acyclic replacement', () => {
    const tasks = [task('a', ['b']), task('b', ['c']), task('c')];
    expect(hasTaskDependencyCycle(tasks, 'c', ['a'])).toBe(true);
    expect(hasTaskDependencyCycle(tasks, 'c', [])).toBe(false);
    expect(hasTaskDependencyCycle(tasks, 'a', ['c'])).toBe(false);
  });
});

describe('PUT /v1/tasks/:id/dependencies', () => {
  it('derives workspace and actor from the authenticated session', async () => {
    const { app, store } = createApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/tasks/task-a/dependencies',
      headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
      payload: { scope: 'workspace', dependencyIds: ['task-b'] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().task).toMatchObject({ id: 'task-a', dependencyIds: ['task-b'] });
    expect(store.lastInput).toEqual({
      scope: { kind: 'workspace', workspaceId: 'workspace-a' },
      actorUserId: 'user-admin',
      taskId: 'task-a',
      dependencyIds: ['task-b'],
    });
  });

  it('derives private scope from the user and never accepts a client user id', async () => {
    const { app, store } = createApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/tasks/task-a/dependencies',
      headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
      payload: { scope: 'private', userId: 'attacker', dependencyIds: [] },
    });

    expect(response.statusCode).toBe(200);
    expect(store.lastInput?.scope).toEqual({ kind: 'private', userId: 'user-admin' });
  });

  it('requires tasks.write and rejects invalid dependency arrays before mutation', async () => {
    const { app } = createApp();
    const forbidden = await app.inject({
      method: 'PUT',
      url: '/v1/tasks/task-a/dependencies',
      headers: { authorization: 'Bearer member', 'content-type': 'application/json' },
      payload: { scope: 'workspace', dependencyIds: ['task-b'] },
    });
    expect(forbidden.statusCode).toBe(403);

    const duplicate = await app.inject({
      method: 'PUT',
      url: '/v1/tasks/task-a/dependencies',
      headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
      payload: { scope: 'workspace', dependencyIds: ['task-b', 'task-b'] },
    });
    expect(duplicate.statusCode).toBe(400);
    expect(duplicate.json()).toEqual({ error: 'invalid_dependency_ids' });

    const tooMany = await app.inject({
      method: 'PUT',
      url: '/v1/tasks/task-a/dependencies',
      headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
      payload: {
        scope: 'workspace',
        dependencyIds: Array.from({ length: 51 }, (_, index) => `task-${index}`),
      },
    });
    expect(tooMany.statusCode).toBe(400);
  });

  it('maps missing tasks, missing dependencies, self-dependencies and cycles without leaking other scopes', async () => {
    const { app } = createApp();

    const missingTask = await app.inject({
      method: 'PUT',
      url: '/v1/tasks/missing/dependencies',
      headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
      payload: { scope: 'workspace', dependencyIds: [] },
    });
    expect(missingTask.statusCode).toBe(404);
    expect(missingTask.json()).toEqual({ error: 'task_not_found' });

    const missingDependency = await app.inject({
      method: 'PUT',
      url: '/v1/tasks/task-a/dependencies',
      headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
      payload: { scope: 'workspace', dependencyIds: ['outside'] },
    });
    expect(missingDependency.statusCode).toBe(409);
    expect(missingDependency.json()).toEqual({
      error: 'dependency_not_found',
      dependencyId: 'outside',
    });

    const self = await app.inject({
      method: 'PUT',
      url: '/v1/tasks/task-a/dependencies',
      headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
      payload: { scope: 'workspace', dependencyIds: ['task-a'] },
    });
    expect(self.statusCode).toBe(409);
    expect(self.json()).toEqual({ error: 'self_dependency' });

    const cycle = await app.inject({
      method: 'PUT',
      url: '/v1/tasks/task-a/dependencies',
      headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
      payload: { scope: 'workspace', dependencyIds: ['cycle'] },
    });
    expect(cycle.statusCode).toBe(409);
    expect(cycle.json()).toEqual({ error: 'dependency_cycle' });
  });
});
