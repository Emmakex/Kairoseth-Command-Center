import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { Alert, Decision, Milestone, Project, Task } from '@kcc/domain';
import type { MilestoneStore, OperationalStore } from '@kcc/persistence';
import { buildApp } from '../src/application';
import type { OperationalAuditStore } from '../src/operational-audit-store';

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
  role: 'owner',
  capabilities: [
    'projects.read',
    'projects.write',
    'tasks.read',
    'tasks.write',
    'alerts.read',
    'alerts.manage',
    'milestones.read',
    'milestones.write',
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

const headers = { authorization: 'Bearer valid-token' };
const now = '2026-10-14T12:00:00.000Z';

function legacyStores() {
  const fail = async () => {
    throw new Error('legacy mutation handler executed');
  };

  const operationalStore = {
    createProject: fail,
    updateProjectStatus: fail,
    createTask: fail,
    updateTaskStatus: fail,
    createAlert: fail,
    updateAlertStatus: fail,
    createDecision: fail,
  } as unknown as OperationalStore;

  const milestoneStore = {
    createMilestone: fail,
    updateMilestoneStatus: fail,
    listMilestones: async () => [],
    appendTimeline: fail,
  } as unknown as MilestoneStore;

  return { operationalStore, milestoneStore };
}

class MemoryAuditStore implements OperationalAuditStore {
  calls: Array<{ operation: string; eventType?: string; scope: string }> = [];

  async createProject(input: Parameters<OperationalAuditStore['createProject']>[0]): Promise<Project> {
    this.calls.push({ operation: 'createProject', eventType: input.eventType, scope: input.scope.kind });
    return {
      id: 'project-audit',
      scope: input.scope,
      name: input.name,
      status: 'active',
      progress: 0,
      ownerUserId: input.actorUserId,
      createdAt: now,
      updatedAt: now,
    };
  }

  async updateProjectStatus(
    input: Parameters<OperationalAuditStore['updateProjectStatus']>[0],
  ): Promise<Project | null> {
    this.calls.push({ operation: 'updateProjectStatus', scope: input.scope.kind });
    return {
      id: input.projectId,
      scope: input.scope,
      name: 'Project',
      status: input.status,
      progress: input.status === 'done' ? 100 : (input.progress ?? 0),
      createdAt: now,
      updatedAt: now,
    };
  }

  async createTask(input: Parameters<OperationalAuditStore['createTask']>[0]): Promise<Task> {
    this.calls.push({ operation: 'createTask', eventType: input.eventType, scope: input.scope.kind });
    return {
      id: 'task-audit',
      scope: input.scope,
      title: input.title,
      status: 'todo',
      priority: input.priority ?? 50,
      assigneeIds: input.scope.kind === 'private' ? [input.actorUserId] : [],
      createdAt: now,
      updatedAt: now,
    };
  }

  async updateTaskStatus(
    input: Parameters<OperationalAuditStore['updateTaskStatus']>[0],
  ): Promise<Task | null> {
    this.calls.push({ operation: 'updateTaskStatus', scope: input.scope.kind });
    return {
      id: input.taskId,
      scope: input.scope,
      title: 'Task',
      status: input.status,
      priority: 50,
      assigneeIds: [],
      createdAt: now,
      updatedAt: now,
      ...(input.status === 'done' ? { completedAt: now } : {}),
    };
  }

  async createAlert(input: Parameters<OperationalAuditStore['createAlert']>[0]): Promise<Alert> {
    this.calls.push({ operation: 'createAlert', scope: input.scope.kind });
    return {
      id: 'alert-audit',
      scope: input.scope,
      title: input.title,
      severity: input.severity,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };
  }

  async updateAlertStatus(
    input: Parameters<OperationalAuditStore['updateAlertStatus']>[0],
  ): Promise<Alert | null> {
    this.calls.push({ operation: 'updateAlertStatus', scope: input.scope.kind });
    return {
      id: input.alertId,
      scope: input.scope,
      title: 'Alert',
      severity: 'warning',
      status: input.status,
      createdAt: now,
      updatedAt: now,
    };
  }

  async createSimpleDecision(
    input: Parameters<OperationalAuditStore['createSimpleDecision']>[0],
  ): Promise<Decision> {
    this.calls.push({ operation: 'createSimpleDecision', scope: input.scope.kind });
    return {
      id: 'decision-audit',
      scope: input.scope,
      title: input.title,
      decision: input.decision,
      status: 'active',
      madeBy: input.actorUserId,
      madeAt: input.madeAt ?? now,
      createdAt: now,
      updatedAt: now,
    };
  }

  async createMilestone(
    input: Parameters<OperationalAuditStore['createMilestone']>[0],
  ): Promise<{ milestone: Milestone; projectProgress: number | null }> {
    this.calls.push({ operation: 'createMilestone', scope: input.scope.kind });
    return {
      milestone: {
        id: 'milestone-audit',
        scope: input.scope,
        projectId: input.projectId,
        title: input.title,
        status: 'planned',
        weight: input.weight,
        createdAt: now,
        updatedAt: now,
      },
      projectProgress: 0,
    };
  }

  async updateMilestoneStatus(
    input: Parameters<OperationalAuditStore['updateMilestoneStatus']>[0],
  ): Promise<{ milestone: Milestone; projectProgress: number | null }> {
    this.calls.push({ operation: 'updateMilestoneStatus', scope: input.scope.kind });
    return {
      milestone: {
        id: input.milestoneId,
        scope: input.scope,
        projectId: 'project-a',
        title: 'Milestone',
        status: input.status,
        weight: 50,
        createdAt: now,
        updatedAt: now,
      },
      projectProgress: input.status === 'done' ? 50 : 0,
    };
  }
}

function appFor(auditStore = new MemoryAuditStore()) {
  const stores = legacyStores();
  return {
    app: buildApp({
      authProvider: provider,
      operationalStore: stores.operationalStore,
      milestoneStore: stores.milestoneStore,
      operationalAuditStore: auditStore,
    }),
    auditStore,
  };
}

describe('transactional operational mutation interception', () => {
  it('intercepts a normal project create before the legacy handler', async () => {
    const { app, auditStore } = appFor();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers,
      payload: { scope: 'workspace', name: 'Atomic project' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().project).toMatchObject({ id: 'project-audit', name: 'Atomic project' });
    expect(auditStore.calls).toEqual([
      { operation: 'createProject', eventType: 'project.created', scope: 'workspace' },
    ]);
    await app.close();
  });

  it('preserves private Quick Capture semantics and event type', async () => {
    const { app, auditStore } = appFor();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/quick-capture',
      headers,
      payload: { scope: 'private', kind: 'task', title: 'Private task', priority: 80 },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ kind: 'task', task: { id: 'task-audit' } });
    expect(auditStore.calls).toEqual([
      { operation: 'createTask', eventType: 'task.quick_captured', scope: 'private' },
    ]);
    await app.close();
  });

  it('intercepts milestone mutations even though their routes are registered later', async () => {
    const { app, auditStore } = appFor();
    const create = await app.inject({
      method: 'POST',
      url: '/v1/milestones',
      headers,
      payload: { scope: 'workspace', projectId: 'project-a', title: 'Gate', weight: 40 },
    });
    const update = await app.inject({
      method: 'PATCH',
      url: '/v1/milestones/milestone-audit/status',
      headers,
      payload: { scope: 'workspace', status: 'done' },
    });

    expect(create.statusCode).toBe(201);
    expect(update.statusCode).toBe(200);
    expect(auditStore.calls.map((call) => call.operation)).toEqual([
      'createMilestone',
      'updateMilestoneStatus',
    ]);
    await app.close();
  });

  it('keeps the Decision compatibility guard ahead of simple atomic creation', async () => {
    const { app, auditStore } = appFor();
    const rejected = await app.inject({
      method: 'POST',
      url: '/v1/decisions',
      headers,
      payload: {
        scope: 'workspace',
        title: 'Linked legacy attempt',
        decision: 'Must use lifecycle',
        projectId: 'project-a',
      },
    });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json()).toEqual({ error: 'decision_lifecycle_required' });
    expect(auditStore.calls).toEqual([]);

    const simple = await app.inject({
      method: 'POST',
      url: '/v1/decisions',
      headers,
      payload: { scope: 'workspace', title: 'Simple', decision: 'Atomic compatibility' },
    });
    expect(simple.statusCode).toBe(201);
    expect(auditStore.calls.map((call) => call.operation)).toEqual(['createSimpleDecision']);
    await app.close();
  });

  it('preserves capability enforcement before the atomic store is invoked', async () => {
    const deniedSession: SessionContext = {
      ...session,
      capabilities: ['projects.read'],
    };
    const deniedProvider: AuthProvider = {
      name: 'denied',
      async resolveSession(input) {
        return input.authorization === 'Bearer valid-token' ? deniedSession : null;
      },
    };
    const auditStore = new MemoryAuditStore();
    const stores = legacyStores();
    const app = buildApp({
      authProvider: deniedProvider,
      operationalStore: stores.operationalStore,
      operationalAuditStore: auditStore,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers,
      payload: { scope: 'workspace', name: 'Denied project' },
    });
    expect(response.statusCode).toBe(403);
    expect(auditStore.calls).toEqual([]);
    await app.close();
  });
});
