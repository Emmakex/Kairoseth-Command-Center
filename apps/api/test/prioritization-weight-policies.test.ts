import { afterEach, describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import {
  defaultPrioritizationWeights,
  rankOperationalPriorities,
  type PrioritizationWeights,
} from '@kcc/domain';
import type {
  EffectivePrioritizationWeightPolicy,
  PrioritizationWeightPolicyStore,
  StoredPrioritizationWeightPolicy,
} from '@kcc/persistence/prioritization-weight-policies';
import { buildApp } from '../src/application';

class TestAuthProvider implements AuthProvider {
  readonly name = 'test';

  async resolveSession(input: { authorization?: string }): Promise<SessionContext | null> {
    const token = input.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return null;
    const workspaceId = token === 'workspace-b' ? 'workspace-b' : 'workspace-a';
    const canManage = token !== 'member';
    return {
      user: {
        id: `user-${token}`,
        email: `${token}@example.test`,
        displayName: token,
        locale: 'en',
        timezone: 'UTC',
      },
      activeWorkspaceId: workspaceId,
      membershipId: `membership-${token}`,
      role: canManage ? 'admin' : 'member',
      capabilities: canManage ? ['automation.manage'] : [],
      productEntitlements: ['command-center'],
    };
  }
}

class MemoryWeightPolicyStore implements PrioritizationWeightPolicyStore {
  private readonly policies = new Map<string, StoredPrioritizationWeightPolicy>();

  async ensureIndexes() {}

  async getEffective(workspaceId: string): Promise<EffectivePrioritizationWeightPolicy> {
    const stored = this.policies.get(workspaceId);
    return stored
      ? { weights: stored.weights, overridden: true, updatedAt: stored.updatedAt }
      : { weights: defaultPrioritizationWeights(), overridden: false };
  }

  async upsert(input: {
    workspaceId: string;
    actorUserId: string;
    weights: PrioritizationWeights;
  }): Promise<StoredPrioritizationWeightPolicy> {
    const existing = this.policies.get(input.workspaceId);
    const now = new Date().toISOString();
    const stored: StoredPrioritizationWeightPolicy = {
      id: existing?.id ?? `policy-${input.workspaceId}`,
      workspaceId: input.workspaceId,
      weights: { ...input.weights },
      updatedByUserId: input.actorUserId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.policies.set(input.workspaceId, stored);
    return stored;
  }
}

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function app(store = new MemoryWeightPolicyStore()) {
  const built = buildApp({
    logger: false,
    authProvider: new TestAuthProvider(),
    prioritizationWeightPolicyStore: store,
  });
  apps.push(built);
  return { app: built, store };
}

describe('prioritization weight policy routes', () => {
  it('returns exact historical defaults before a workspace override exists', async () => {
    const { app: instance } = app();
    const response = await instance.inject({
      method: 'GET',
      url: '/v1/prioritization/weights',
      headers: { authorization: 'Bearer admin' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      policy: {
        weights: defaultPrioritizationWeights(),
        overridden: false,
      },
    });
  });

  it('patches only allow-listed integer weights while preserving unspecified effective values', async () => {
    const { app: instance } = app();
    const response = await instance.inject({
      method: 'PATCH',
      url: '/v1/prioritization/weights',
      headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
      payload: { weights: { taskBlocked: 75, alertCritical: 95 } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().policy).toMatchObject({
      overridden: true,
      weights: {
        taskBlocked: 75,
        alertCritical: 95,
        taskOverdue: 35,
        milestoneOverdue: 40,
      },
    });
  });

  it('keeps workspace policies isolated', async () => {
    const { app: instance } = app();
    await instance.inject({
      method: 'PATCH',
      url: '/v1/prioritization/weights',
      headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
      payload: { weights: { taskBlocked: 80 } },
    });

    const otherWorkspace = await instance.inject({
      method: 'GET',
      url: '/v1/prioritization/weights',
      headers: { authorization: 'Bearer workspace-b' },
    });
    expect(otherWorkspace.statusCode).toBe(200);
    expect(otherWorkspace.json().policy).toEqual({
      weights: defaultPrioritizationWeights(),
      overridden: false,
    });
  });

  it('requires automation.manage and rejects unknown, empty, fractional or out-of-range changes', async () => {
    const { app: instance } = app();
    expect(
      (
        await instance.inject({
          method: 'GET',
          url: '/v1/prioritization/weights',
          headers: { authorization: 'Bearer member' },
        })
      ).statusCode,
    ).toBe(403);

    for (const payload of [
      { weights: {} },
      { weights: { unknownWeight: 20 } },
      { weights: { taskBlocked: 10.5 } },
      { weights: { taskBlocked: -1 } },
      { weights: { taskBlocked: 101 } },
      { weights: { taskBlocked: 30 }, workspaceId: 'workspace-b' },
    ]) {
      const response = await instance.inject({
        method: 'PATCH',
        url: '/v1/prioritization/weights',
        headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
        payload,
      });
      expect(response.statusCode).toBe(400);
    }
  });
});

describe('configurable prioritization scoring', () => {
  it('changes deterministic contributions without changing stable reason codes', () => {
    const [item] = rankOperationalPriorities({
      tasks: [
        {
          id: 'task-1',
          scope: { kind: 'workspace', workspaceId: 'workspace-a' },
          title: 'Blocked task',
          status: 'blocked',
          priority: 100,
          assigneeIds: [],
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
        },
      ],
      alerts: [],
      range: {
        start: '2026-10-16T00:00:00.000Z',
        end: '2026-10-17T00:00:00.000Z',
      },
      weights: {
        taskManualPriorityMax: 0,
        taskBlocked: 80,
      },
    });

    expect(item).toMatchObject({
      id: 'task-1',
      score: 80,
      reasons: [{ code: 'task.blocked', contribution: 80 }],
    });
  });
});
