import { describe, expect, it } from 'vitest';
import type { IntegrationSignal } from '@kcc/integrations';
import {
  defaultSignalAlertRulePolicies,
  deriveAlertsFromIntegrationSignal,
  reconcileAlertsFromIntegrationSignals,
} from '@kcc/integrations/signal-alert-rules';

function ciSignal(
  payload: Record<string, unknown>,
  options: { id?: string; occurredAt?: string } = {},
): IntegrationSignal {
  return {
    id: options.id ?? 'provider:workflow-run:701',
    source: 'provider-x',
    type: 'repository.ci',
    workspaceId: 'workspace-a',
    occurredAt: options.occurredAt ?? '2026-10-15T10:00:00.000Z',
    payload: {
      resourceId: 'resource-1',
      projectId: 'project-a',
      repository: 'acme/product',
      name: 'Release gate',
      headBranch: 'main',
      ...payload,
    },
  };
}

describe('provider-neutral integration signal alert rules', () => {
  it('keeps the historical built-in defaults unchanged', () => {
    expect(defaultSignalAlertRulePolicies()).toEqual([
      { ruleId: 'repository.ci.failed.v1', enabled: true, severity: 'urgent' },
      { ruleId: 'repository.ci.action_required.v1', enabled: true, severity: 'warning' },
    ]);
  });

  it('derives an urgent idempotent alert from a failed CI signal without depending on provider name', () => {
    const [alert] = deriveAlertsFromIntegrationSignal(ciSignal({ conclusion: 'failure' }));

    expect(alert).toEqual({
      ruleId: 'repository.ci.failed.v1',
      fingerprint: 'integration-rule:repository.ci.failed.v1:provider:workflow-run:701',
      title: 'CI · Release gate',
      message: 'acme/product · main · failure',
      severity: 'urgent',
      signalId: 'provider:workflow-run:701',
      signalType: 'repository.ci',
      occurredAt: '2026-10-15T10:00:00.000Z',
      projectId: 'project-a',
    });
  });

  it('maps action_required to warning but ignores successful and cancelled runs', () => {
    expect(deriveAlertsFromIntegrationSignal(ciSignal({ conclusion: 'action_required' }))[0]?.severity).toBe('warning');
    expect(deriveAlertsFromIntegrationSignal(ciSignal({ conclusion: 'success' }))).toEqual([]);
    expect(deriveAlertsFromIntegrationSignal(ciSignal({ conclusion: 'cancelled' }))).toEqual([]);
  });

  it('applies a workspace severity override without changing the alert fingerprint', () => {
    const [alert] = deriveAlertsFromIntegrationSignal(ciSignal({ conclusion: 'failure' }), {
      'repository.ci.failed.v1': { enabled: true, severity: 'critical' },
    });

    expect(alert?.severity).toBe('critical');
    expect(alert?.fingerprint).toBe(
      'integration-rule:repository.ci.failed.v1:provider:workflow-run:701',
    );
  });

  it('suppresses a disabled rule and emits its fingerprint as a resolution candidate', () => {
    const signal = ciSignal({ conclusion: 'failure' });
    const result = reconcileAlertsFromIntegrationSignals([signal], {
      'repository.ci.failed.v1': { enabled: false, severity: 'urgent' },
    });

    expect(result.active).toEqual([]);
    expect(result.resolve.map((item) => item.fingerprint)).toContain(
      'integration-rule:repository.ci.failed.v1:provider:workflow-run:701',
    );
  });

  it('keeps policies isolated by rule id', () => {
    expect(
      deriveAlertsFromIntegrationSignal(ciSignal({ conclusion: 'action_required' }), {
        'repository.ci.failed.v1': { enabled: false, severity: 'critical' },
      })[0]?.severity,
    ).toBe('warning');
  });

  it('ignores non-CI signals even if their payload contains a failure-like field', () => {
    const signal: IntegrationSignal = {
      ...ciSignal({ conclusion: 'failure' }),
      type: 'repository.issue',
    };
    expect(deriveAlertsFromIntegrationSignal(signal)).toEqual([]);
  });

  it('resolves both possible alert fingerprints when the current CI signal becomes healthy', () => {
    const signal = ciSignal(
      { conclusion: 'success' },
      { occurredAt: '2026-10-15T10:10:00.000Z' },
    );
    const result = reconcileAlertsFromIntegrationSignals([signal]);

    expect(result.active).toEqual([]);
    expect(result.resolve).toEqual([
      {
        ruleId: 'repository.ci.failed.v1',
        fingerprint: 'integration-rule:repository.ci.failed.v1:provider:workflow-run:701',
        causeSignalId: 'provider:workflow-run:701',
        signalType: 'repository.ci',
        occurredAt: '2026-10-15T10:10:00.000Z',
      },
      {
        ruleId: 'repository.ci.action_required.v1',
        fingerprint: 'integration-rule:repository.ci.action_required.v1:provider:workflow-run:701',
        causeSignalId: 'provider:workflow-run:701',
        signalType: 'repository.ci',
        occurredAt: '2026-10-15T10:10:00.000Z',
      },
    ]);
  });

  it('keeps only the newest unhealthy run active and resolves older alerts in the same CI series', () => {
    const olderFailure = ciSignal(
      { conclusion: 'failure' },
      { id: 'provider:workflow-run:700', occurredAt: '2026-10-15T09:50:00.000Z' },
    );
    const newerFailure = ciSignal(
      { conclusion: 'timed_out' },
      { id: 'provider:workflow-run:701', occurredAt: '2026-10-15T10:00:00.000Z' },
    );
    const result = reconcileAlertsFromIntegrationSignals([olderFailure, newerFailure]);

    expect(result.active).toHaveLength(1);
    expect(result.active[0]?.fingerprint).toBe(
      'integration-rule:repository.ci.failed.v1:provider:workflow-run:701',
    );
    expect(result.resolve.map((item) => item.fingerprint)).toContain(
      'integration-rule:repository.ci.failed.v1:provider:workflow-run:700',
    );
    expect(result.resolve.map((item) => item.fingerprint)).not.toContain(
      'integration-rule:repository.ci.failed.v1:provider:workflow-run:701',
    );
  });

  it('treats cancelled as lifecycle-neutral so it does not hide the previous decisive failure', () => {
    const failure = ciSignal(
      { conclusion: 'failure' },
      { id: 'provider:workflow-run:700', occurredAt: '2026-10-15T09:50:00.000Z' },
    );
    const cancelled = ciSignal(
      { conclusion: 'cancelled' },
      { id: 'provider:workflow-run:701', occurredAt: '2026-10-15T10:00:00.000Z' },
    );
    const result = reconcileAlertsFromIntegrationSignals([failure, cancelled]);

    expect(result.active.map((item) => item.fingerprint)).toEqual([
      'integration-rule:repository.ci.failed.v1:provider:workflow-run:700',
    ]);
    expect(result.resolve.map((item) => item.fingerprint)).not.toContain(
      'integration-rule:repository.ci.failed.v1:provider:workflow-run:700',
    );
  });
});
