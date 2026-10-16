import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import { defaultPrioritizationWeights, type Scope } from '@kcc/domain';
import type { MilestoneStore, OperationalStore } from '@kcc/persistence';
import type {
  PrioritizationWeightPolicyStore,
  StoredPrioritizationWeightPolicy,
} from '@kcc/persistence/prioritization-weight-policies';
import { buildApp } from '../src/application';

class ReadAuthProvider implements AuthProvider {
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
      capabilities: ['tasks.read', 'alerts.read', 'projects.read', 'milestones.read'],
      productEntitlements: ['command-center'],
    };
  }
}

class WorkspaceWeightStore implements PrioritizationWeightPolicyStore {
  reads = 0;

  async ensureIndexes() {}

  async getEffective() {
    this.reads += 1;
    return {
      weights: {
        ...defaultPrioritizationWeights(),
        taskManualPriorityMax: 10,
      },
      overridden: true,
      updatedAt: '2026-10-16T08:00:00.000Z',
    };
  }

  async upsert(): Promise<StoredPrioritizationWeightPolicy> {
    throw new Error('not_used');
  }
}

function operationalStore(): OperationalStore {
  return {
    async listTasks(scope: Scope) {
      return [
        {
          id: 'task-1',
          scope,
          title: 'Priority target',
          status: 'todo' as const,
          priority: 100,
          assigneeIds: [],
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
        },
      ];
    },
    async listAlerts() {
      return [];
    },
    async listProjects() {
      return [];
    },
  } as unknown as OperationalStore;
}

function milestoneStore(): MilestoneStore {
  return {
    async listMilestones() {
      return [];
    },
  } as unknown as MilestoneStore;
}

describe('workspace prioritization weight application', () => {
  it('applies workspace weights while private scope keeps product defaults', async () => {
    const policyStore = new WorkspaceWeightStore();
    const app = buildApp({
      logger: false,
      authProvider: new ReadAuthProvider(),
      operationalStore: operationalStore(),
      milestoneStore: milestoneStore(),
      prioritizationWeightPolicyStore: policyStore,
    });

    const workspace = await app.inject({
      method: 'GET',
      url: '/v1/priorities?scope=workspace',
      headers: { authorization: 'Bearer test' },
    });
    expect(workspace.statusCode).toBe(200);
    expect(workspace.json().priorities[0]).toMatchObject({ id: 'task-1', score: 10 });
    expect(policyStore.reads).toBe(1);

    const privateScope = await app.inject({
      method: 'GET',
      url: '/v1/priorities?scope=private',
      headers: { authorization: 'Bearer test' },
    });
    expect(privateScope.statusCode).toBe(200);
    expect(privateScope.json().priorities[0]).toMatchObject({ id: 'task-1', score: 50 });
    expect(policyStore.reads).toBe(1);

    await app.close();
  });
});
