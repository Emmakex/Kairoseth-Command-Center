import { afterEach, describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { Scope, Task } from '@kcc/domain';
import type { OperationalStore } from '@kcc/persistence';
import { buildApp } from '../src/application';

function sameScope(left: Scope, right: Scope): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function task(
  id: string,
  scope: Scope,
  status: Task['status'] = 'todo',
  dependencyIds: string[] = [],
): Task {
  return {
    id,
    scope,
    title: id,
    status,
    priority: 50,
    assigneeIds: [],
    dependencyIds,
    createdAt: '2026-10-16T00:00:00.000Z',
    updatedAt: '2026-10-16T00:00:00.000Z',
  };
}

class MemoryOperationalStore {
  tasks: Task[] = [];
  updates = 0;

  async listTasks(scope: Scope): Promise<Task[]> {
    return this.tasks.filter((candidate) => sameScope(candidate.scope, scope));
  }

  async updateTaskStatus(scope: Scope, taskId: string, status: Task['status']): Promise<Task | null> {
    const found = this.tasks.find(
      (candidate) => candidate.id === taskId && sameScope(candidate.scope, scope),
    );
    if (!found) return null;
    found.status = status;
    this.updates += 1;
    return found;
  }

  async appendTimeline() {
    return {};
  }
}

class TestAuthProvider implements AuthProvider {
  readonly name = 'test';

  async resolveSession(input: { authorization?: string }): Promise<SessionContext | null> {
    if (!input.authorization) return null;
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
      capabilities: ['tasks.read', 'tasks.write'],
      productEntitlements: ['command-center'],
    };
  }
}

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function appFor(store: MemoryOperationalStore) {
  const app = buildApp({
    logger: false,
    authProvider: new TestAuthProvider(),
    operationalStore: store as unknown as OperationalStore,
  });
  apps.push(app);
  return app;
}

const headers = { authorization: 'Bearer test', 'content-type': 'application/json' };

describe('task dependency start guard', () => {
  it('rejects starting a task while any explicit dependency is not done', async () => {
    const store = new MemoryOperationalStore();
    const scope: Scope = { kind: 'workspace', workspaceId: 'workspace-a' };
    store.tasks.push(task('dependency', scope, 'in_progress'), task('target', scope, 'todo', ['dependency']));
    const app = appFor(store);

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/tasks/target/status',
      headers,
      payload: { scope: 'workspace', status: 'in_progress' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'task_dependencies_incomplete',
      dependencyIds: ['dependency'],
    });
    expect(store.updates).toBe(0);
    expect(store.tasks.find((item) => item.id === 'target')?.status).toBe('todo');
  });

  it('allows starting when every dependency is done', async () => {
    const store = new MemoryOperationalStore();
    const scope: Scope = { kind: 'workspace', workspaceId: 'workspace-a' };
    store.tasks.push(task('dependency', scope, 'done'), task('target', scope, 'todo', ['dependency']));
    const app = appFor(store);

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/tasks/target/status',
      headers,
      payload: { scope: 'workspace', status: 'in_progress' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().task).toMatchObject({ id: 'target', status: 'in_progress' });
    expect(store.updates).toBe(1);
  });

  it('treats a missing same-scope dependency as incomplete without leaking other scopes', async () => {
    const store = new MemoryOperationalStore();
    const workspace: Scope = { kind: 'workspace', workspaceId: 'workspace-a' };
    const foreign: Scope = { kind: 'workspace', workspaceId: 'workspace-b' };
    store.tasks.push(task('foreign-dependency', foreign, 'done'));
    store.tasks.push(task('target', workspace, 'todo', ['foreign-dependency']));
    const app = appFor(store);

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/tasks/target/status',
      headers,
      payload: { scope: 'workspace', workspaceId: 'workspace-b', status: 'in_progress' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'task_dependencies_incomplete',
      dependencyIds: ['foreign-dependency'],
    });
    expect(store.updates).toBe(0);
  });

  it('does not block explicit non-start status changes', async () => {
    const store = new MemoryOperationalStore();
    const scope: Scope = { kind: 'workspace', workspaceId: 'workspace-a' };
    store.tasks.push(task('dependency', scope, 'todo'), task('target', scope, 'todo', ['dependency']));
    const app = appFor(store);

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/tasks/target/status',
      headers,
      payload: { scope: 'workspace', status: 'blocked' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().task.status).toBe('blocked');
    expect(store.updates).toBe(1);
  });
});
