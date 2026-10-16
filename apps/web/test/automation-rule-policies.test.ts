import { describe, expect, it } from 'vitest';
import { parseAutomationRulePolicyMutation } from '../lib/automation-rule-policies';

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe('parseAutomationRulePolicyMutation', () => {
  it('builds a safe built-in CI rule policy update', () => {
    expect(
      parseAutomationRulePolicyMutation(
        form({
          operation: 'rule-update',
          ruleId: 'repository.ci.failed.v1',
          enabled: 'false',
          severity: 'critical',
        }),
      ),
    ).toEqual({
      path: '/v1/automation/rules/repository.ci.failed.v1',
      method: 'PATCH',
      body: { enabled: false, severity: 'critical' },
    });
  });

  it('adds a validated inactivity threshold to stale pull-request and issue mutations', () => {
    expect(
      parseAutomationRulePolicyMutation(
        form({
          operation: 'rule-update',
          ruleId: 'repository.pull_request.stale.v1',
          enabled: 'true',
          severity: 'urgent',
          staleAfterDays: '14',
        }),
      ),
    ).toEqual({
      path: '/v1/automation/rules/repository.pull_request.stale.v1',
      method: 'PATCH',
      body: { enabled: true, severity: 'urgent', staleAfterDays: 14 },
    });

    expect(
      parseAutomationRulePolicyMutation(
        form({
          operation: 'rule-update',
          ruleId: 'repository.issue.stale.v1',
          enabled: 'false',
          severity: 'warning',
          staleAfterDays: '365',
        }),
      ),
    ).toEqual({
      path: '/v1/automation/rules/repository.issue.stale.v1',
      method: 'PATCH',
      body: { enabled: false, severity: 'warning', staleAfterDays: 365 },
    });
  });

  it('preserves compatibility with stale-rule mutations that omit the threshold', () => {
    expect(
      parseAutomationRulePolicyMutation(
        form({
          operation: 'rule-update',
          ruleId: 'repository.issue.stale.v1',
          enabled: 'true',
          severity: 'warning',
        }),
      ),
    ).toEqual({
      path: '/v1/automation/rules/repository.issue.stale.v1',
      method: 'PATCH',
      body: { enabled: true, severity: 'warning' },
    });
  });

  it('accepts the second proven CI rule', () => {
    expect(
      parseAutomationRulePolicyMutation(
        form({
          operation: 'rule-update',
          ruleId: 'repository.ci.action_required.v1',
          enabled: 'true',
          severity: 'warning',
        }),
      ),
    ).toEqual({
      path: '/v1/automation/rules/repository.ci.action_required.v1',
      method: 'PATCH',
      body: { enabled: true, severity: 'warning' },
    });
  });

  it('rejects threshold values outside the 1..365 whole-day boundary', () => {
    for (const staleAfterDays of ['0', '366', '1.5', 'abc', '-1']) {
      expect(
        parseAutomationRulePolicyMutation(
          form({
            operation: 'rule-update',
            ruleId: 'repository.pull_request.stale.v1',
            enabled: 'true',
            severity: 'warning',
            staleAfterDays,
          }),
        ),
      ).toBeNull();
    }

    expect(
      parseAutomationRulePolicyMutation(
        form({
          operation: 'rule-update',
          ruleId: 'repository.pull_request.stale.v1',
          enabled: 'true',
          severity: 'warning',
          staleAfterDays: '1',
        }),
      )?.body.staleAfterDays,
    ).toBe(1);
  });

  it('rejects stale thresholds on CI rules', () => {
    expect(
      parseAutomationRulePolicyMutation(
        form({
          operation: 'rule-update',
          ruleId: 'repository.ci.failed.v1',
          enabled: 'true',
          severity: 'urgent',
          staleAfterDays: '14',
        }),
      ),
    ).toBeNull();
  });

  it('rejects arbitrary fields so browser input cannot choose tenant or actor authority', () => {
    expect(
      parseAutomationRulePolicyMutation(
        form({
          operation: 'rule-update',
          ruleId: 'repository.issue.stale.v1',
          enabled: 'true',
          severity: 'warning',
          staleAfterDays: '14',
          workspaceId: 'workspace-other',
        }),
      ),
    ).toBeNull();
  });

  it('rejects arbitrary rule IDs, booleans and severities', () => {
    expect(
      parseAutomationRulePolicyMutation(
        form({
          operation: 'rule-update',
          ruleId: 'custom.javascript.rule',
          enabled: 'true',
          severity: 'critical',
        }),
      ),
    ).toBeNull();

    expect(
      parseAutomationRulePolicyMutation(
        form({
          operation: 'rule-update',
          ruleId: 'repository.ci.failed.v1',
          enabled: 'yes',
          severity: 'critical',
        }),
      ),
    ).toBeNull();

    expect(
      parseAutomationRulePolicyMutation(
        form({
          operation: 'rule-update',
          ruleId: 'repository.ci.failed.v1',
          enabled: 'true',
          severity: 'blocker',
        }),
      ),
    ).toBeNull();
  });
});
