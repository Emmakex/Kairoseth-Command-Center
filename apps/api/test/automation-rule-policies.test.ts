import { afterEach, describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import {
  defaultSignalAlertRulePolicies,
  type BuiltInSignalAlertRuleId,
  type DerivedAlertSeverity,
} from '@kcc/integrations/signal-alert-rules';
import type {
  EffectiveSignalAlertRulePolicy,
  SignalAlertRulePolicyStore,
  StoredSignalAlertRulePolicy,
} from '@kcc/persistence/signal-alert-rule-policies';
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

class MemoryPolicyStore implements SignalAlertRulePolicyStore {
  private readonly policies = new Map<string, StoredSignalAlertRulePolicy>();

  async ensureIndexes() {}

  async listEffective(workspaceId: string): Promise<EffectiveSignalAlertRulePolicy[]> {
    return defaultSignalAlertRulePolicies().map((defaults) => {
      const stored = this.policies.get(`${workspaceId}:${defaults.ruleId}`);
      return stored
        ? {
            ruleId: stored.ruleId,
            enabled: stored.enabled,
            severity: stored.severity,
            overridden: true,
            updatedAt: stored.updatedAt,
          }
        : { ...defaults, overridden: false };
    });
  }

  async getPolicyMap() {
    return {};
  }

  async upsert(input: {
    workspaceId: string;
    actorUserId: string;
    ruleId: BuiltInSignalAlertRuleId;
    enabled: boolean;
    severity: DerivedAlertSeverity;
  }): Promise<StoredSignalAlertRulePolicy> {
    const key = `${input.workspaceId}:${input.ruleId}`;
    const existing = this.policies.get(key);
    const now = new Date().toISOString();
    const stored: StoredSignalAlertRulePolicy = {
      id: existing?.id ?? `policy-${input.workspaceId}-${input.ruleId}`,
      workspaceId: input.workspaceId,
      ruleId: input.ruleId,
      enabled: input.enabled,
      severity: input.severity,
      updatedByUserId: input.actorUserId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.policies.set(key, stored);
    return stored;
  }
}

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function app() {
  const built = buildApp({
    logger: false,
    authProvider: new TestAuthProvider(),
    signalAlertRulePolicyStore: new MemoryPolicyStore(),
  });
  apps.push(built);
  return built;
}

describe('automation rule policy routes', () => {
  it('returns the built-in defaults before a workspace creates overrides', async () => {
    const response = await app().inject({
      method: 'GET',
      url: '/v1/automation/rules',
      headers: { authorization: 'Bearer admin' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      rules: [
        {
          ruleId: 'repository.ci.failed.v1',
          enabled: true,
          severity: 'urgent',
          overridden: false,
        },
        {
          ruleId: 'repository.ci.action_required.v1',
          enabled: true,
          severity: 'warning',
          overridden: false,
        },
      ],
    });
  });

  it('updates one rule while preserving unspecified effective values', async () => {
    const instance = app();
    const update = await instance.inject({
      method: 'PATCH',
      url: '/v1/automation/rules/repository.ci.failed.v1',
      headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
      payload: { severity: 'critical' },
    });

    expect(update.statusCode).toBe(200);
    expect(update.json().rule).toMatchObject({
      ruleId: 'repository.ci.failed.v1',
      enabled: true,
      severity: 'critical',
      overridden: true,
    });

    const read = await instance.inject({
      method: 'GET',
      url: '/v1/automation/rules',
      headers: { authorization: 'Bearer admin' },
    });
    expect(read.json().rules[0]).toMatchObject({ enabled: true, severity: 'critical' });
  });

  it('keeps workspace rule policies isolated', async () => {
    const instance = app();
    await instance.inject({
      method: 'PATCH',
      url: '/v1/automation/rules/repository.ci.failed.v1',
      headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
      payload: { enabled: false },
    });

    const otherWorkspace = await instance.inject({
      method: 'GET',
      url: '/v1/automation/rules',
      headers: { authorization: 'Bearer workspace-b' },
    });
    expect(otherWorkspace.json().rules[0]).toMatchObject({ enabled: true, severity: 'urgent' });
  });

  it('requires automation.manage and rejects unknown rules or invalid policy values', async () => {
    const instance = app();
    expect(
      (
        await instance.inject({
          method: 'GET',
          url: '/v1/automation/rules',
          headers: { authorization: 'Bearer member' },
        })
      ).statusCode,
    ).toBe(403);

    expect(
      (
        await instance.inject({
          method: 'PATCH',
          url: '/v1/automation/rules/unknown-rule',
          headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
          payload: { enabled: false },
        })
      ).statusCode,
    ).toBe(404);

    expect(
      (
        await instance.inject({
          method: 'PATCH',
          url: '/v1/automation/rules/repository.ci.failed.v1',
          headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
          payload: { severity: 'catastrophic' },
        })
      ).statusCode,
    ).toBe(400);
  });
});
