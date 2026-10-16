import { afterEach, describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import {
  STALE_WORK_AFTER_DAYS,
  defaultSignalAlertRulePolicies,
  isStaleWorkRuleId,
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
      if (!stored) return { ...defaults, overridden: false };
      return {
        ruleId: stored.ruleId,
        enabled: stored.enabled,
        severity: stored.severity,
        ...(isStaleWorkRuleId(stored.ruleId)
          ? { staleAfterDays: stored.staleAfterDays ?? defaults.staleAfterDays ?? STALE_WORK_AFTER_DAYS }
          : {}),
        overridden: true,
        updatedAt: stored.updatedAt,
      };
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
    staleAfterDays?: number;
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
      ...(input.staleAfterDays !== undefined ? { staleAfterDays: input.staleAfterDays } : {}),
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
  it('returns CI defaults plus safely-disabled seven-day stale-work defaults before workspace overrides', async () => {
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
        {
          ruleId: 'repository.pull_request.stale.v1',
          enabled: false,
          severity: 'warning',
          staleAfterDays: 7,
          overridden: false,
        },
        {
          ruleId: 'repository.issue.stale.v1',
          enabled: false,
          severity: 'warning',
          staleAfterDays: 7,
          overridden: false,
        },
      ],
    });
  });

  it('updates one CI rule while preserving unspecified effective values', async () => {
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

  it('configures a stale pull-request threshold and preserves it across later partial updates', async () => {
    const instance = app();
    const response = await instance.inject({
      method: 'PATCH',
      url: '/v1/automation/rules/repository.pull_request.stale.v1',
      headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
      payload: { enabled: true, severity: 'urgent', staleAfterDays: 14 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().rule).toMatchObject({
      ruleId: 'repository.pull_request.stale.v1',
      enabled: true,
      severity: 'urgent',
      staleAfterDays: 14,
      overridden: true,
    });

    const severityOnly = await instance.inject({
      method: 'PATCH',
      url: '/v1/automation/rules/repository.pull_request.stale.v1',
      headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
      payload: { severity: 'critical' },
    });
    expect(severityOnly.statusCode).toBe(200);
    expect(severityOnly.json().rule).toMatchObject({
      enabled: true,
      severity: 'critical',
      staleAfterDays: 14,
    });
  });

  it('keeps workspace rule policies and stale thresholds isolated', async () => {
    const instance = app();
    await instance.inject({
      method: 'PATCH',
      url: '/v1/automation/rules/repository.issue.stale.v1',
      headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
      payload: { enabled: true, staleAfterDays: 30 },
    });

    const otherWorkspace = await instance.inject({
      method: 'GET',
      url: '/v1/automation/rules',
      headers: { authorization: 'Bearer workspace-b' },
    });
    expect(otherWorkspace.json().rules[3]).toMatchObject({
      enabled: false,
      severity: 'warning',
      staleAfterDays: 7,
    });
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

  it('accepts only whole-day stale thresholds from 1 through 365 and rejects them for CI rules', async () => {
    const instance = app();
    for (const staleAfterDays of [0, 366, 1.5]) {
      const response = await instance.inject({
        method: 'PATCH',
        url: '/v1/automation/rules/repository.issue.stale.v1',
        headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
        payload: { staleAfterDays },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_stale_after_days' });
    }

    for (const staleAfterDays of [1, 365]) {
      const response = await instance.inject({
        method: 'PATCH',
        url: '/v1/automation/rules/repository.issue.stale.v1',
        headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
        payload: { staleAfterDays },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().rule.staleAfterDays).toBe(staleAfterDays);
    }

    const ciResponse = await instance.inject({
      method: 'PATCH',
      url: '/v1/automation/rules/repository.ci.failed.v1',
      headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
      payload: { staleAfterDays: 14 },
    });
    expect(ciResponse.statusCode).toBe(400);
    expect(ciResponse.json()).toEqual({ error: 'stale_threshold_not_supported' });
  });
});