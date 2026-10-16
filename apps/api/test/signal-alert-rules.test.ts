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

function workSignal(
  type: 'repository.pull_request' | 'repository.issue',
  payload: Record<string, unknown>,
  options: { id?: string; occurredAt?: string } = {},
): IntegrationSignal {
  return {
    id:
      options.id ??
      (type === 'repository.pull_request' ? 'provider:pull-request:17' : 'provider:issue:42'),
    source: 'provider-x',
    type,
    workspaceId: 'workspace-a',
    occurredAt: options.occurredAt ?? '2026-10-01T10:00:00.000Z',
    payload: {
      resourceId: 'resource-1',
      projectId: 'project-a',
      repository: 'acme/product',
      number: type === 'repository.pull_request' ? 17 : 42,
      title: type === 'repository.pull_request' ? 'Ship automation UI' : 'Investigate retry drift',
      state: 'open',
      ...(type === 'repository.pull_request' ? { merged: false } : {}),
      ...payload,
    },
  };
}

describe('provider-neutral integration signal alert rules', () => {
  it('keeps historical CI defaults and introduces stale-work rules safely disabled at seven days', () => {
    expect(defaultSignalAlertRulePolicies()).toEqual([
      { ruleId: 'repository.ci.failed.v1', enabled: true, severity: 'urgent' },
      { ruleId: 'repository.ci.action_required.v1', enabled: true, severity: 'warning' },
      {
        ruleId: 'repository.pull_request.stale.v1',
        enabled: false,
        severity: 'warning',
        staleAfterDays: 7,
      },
      {
        ruleId: 'repository.issue.stale.v1',
        enabled: false,
        severity: 'warning',
        staleAfterDays: 7,
      },
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

  it('suppresses a disabled CI rule and emits its fingerprint as a resolution candidate', () => {
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

  it('ignores an issue with a failure-like field when the stale rule is still disabled', () => {
    const signal = workSignal('repository.issue', { conclusion: 'failure' });
    expect(deriveAlertsFromIntegrationSignal(signal)).toEqual([]);
  });

  it('derives a stale pull-request alert after seven days when explicitly enabled', () => {
    const signal = workSignal('repository.pull_request', {});
    const [alert] = deriveAlertsFromIntegrationSignal(
      signal,
      {
        'repository.pull_request.stale.v1': { enabled: true, severity: 'urgent' },
      },
      { now: '2026-10-08T10:00:00.000Z' },
    );

    expect(alert).toEqual({
      ruleId: 'repository.pull_request.stale.v1',
      fingerprint: 'integration-rule:repository.pull_request.stale.v1:provider:pull-request:17',
      title: 'Stale PR · #17 · Ship automation UI',
      message: 'acme/product · no activity for 7+ days',
      severity: 'urgent',
      signalId: 'provider:pull-request:17',
      signalType: 'repository.pull_request',
      occurredAt: '2026-10-08T10:00:00.000Z',
      projectId: 'project-a',
    });
  });

  it('applies a custom stale threshold without changing the stable fingerprint', () => {
    const signal = workSignal('repository.pull_request', {});
    const shortPolicy = {
      'repository.pull_request.stale.v1': {
        enabled: true,
        severity: 'warning' as const,
        staleAfterDays: 3,
      },
    };
    const [alert] = deriveAlertsFromIntegrationSignal(signal, shortPolicy, {
      now: '2026-10-04T10:00:00.000Z',
    });

    expect(alert?.fingerprint).toBe(
      'integration-rule:repository.pull_request.stale.v1:provider:pull-request:17',
    );
    expect(alert?.message).toBe('acme/product · no activity for 3+ days');

    expect(
      deriveAlertsFromIntegrationSignal(
        signal,
        {
          'repository.pull_request.stale.v1': {
            enabled: true,
            severity: 'warning',
            staleAfterDays: 5,
          },
        },
        { now: '2026-10-04T10:00:00.000Z' },
      ),
    ).toEqual([]);
  });

  it('resolves the stable stale-work fingerprint when a raised threshold makes work recent again', () => {
    const issue = workSignal('repository.issue', {});
    const result = reconcileAlertsFromIntegrationSignals(
      [issue],
      {
        'repository.issue.stale.v1': {
          enabled: true,
          severity: 'warning',
          staleAfterDays: 14,
        },
      },
      { now: '2026-10-08T10:00:00.000Z' },
    );

    expect(result.active).toEqual([]);
    expect(result.resolve).toContainEqual(
      expect.objectContaining({
        ruleId: 'repository.issue.stale.v1',
        fingerprint: 'integration-rule:repository.issue.stale.v1:provider:issue:42',
      }),
    );
  });

  it('does not mark recent, closed or merged pull requests stale', () => {
    const policy = {
      'repository.pull_request.stale.v1': { enabled: true, severity: 'warning' as const },
    };

    expect(
      deriveAlertsFromIntegrationSignal(
        workSignal('repository.pull_request', {}, { occurredAt: '2026-10-02T10:00:00.000Z' }),
        policy,
        { now: '2026-10-08T09:59:59.000Z' },
      ),
    ).toEqual([]);
    expect(
      deriveAlertsFromIntegrationSignal(
        workSignal('repository.pull_request', { state: 'closed' }),
        policy,
        { now: '2026-10-08T10:00:00.000Z' },
      ),
    ).toEqual([]);
    expect(
      deriveAlertsFromIntegrationSignal(
        workSignal('repository.pull_request', { merged: true }),
        policy,
        { now: '2026-10-08T10:00:00.000Z' },
      ),
    ).toEqual([]);
  });

  it('derives a stale issue alert after seven days when explicitly enabled', () => {
    const signal = workSignal('repository.issue', {});
    const [alert] = deriveAlertsFromIntegrationSignal(
      signal,
      {
        'repository.issue.stale.v1': { enabled: true, severity: 'critical' },
      },
      { now: '2026-10-08T10:00:00.000Z' },
    );

    expect(alert?.ruleId).toBe('repository.issue.stale.v1');
    expect(alert?.title).toBe('Stale Issue · #42 · Investigate retry drift');
    expect(alert?.severity).toBe('critical');
    expect(alert?.occurredAt).toBe('2026-10-08T10:00:00.000Z');
  });

  it('resolves an existing stale-work fingerprint when the work becomes recent or the rule is disabled', () => {
    const pullRequest = workSignal('repository.pull_request', {}, { occurredAt: '2026-10-07T10:00:00.000Z' });
    const issue = workSignal('repository.issue', {});
    const result = reconcileAlertsFromIntegrationSignals(
      [pullRequest, issue],
      {
        'repository.pull_request.stale.v1': { enabled: true, severity: 'warning' },
        'repository.issue.stale.v1': { enabled: false, severity: 'warning' },
      },
      { now: '2026-10-08T10:00:00.000Z' },
    );

    expect(result.active).toEqual([]);
    expect(result.resolve).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'repository.pull_request.stale.v1',
          fingerprint: 'integration-rule:repository.pull_request.stale.v1:provider:pull-request:17',
          occurredAt: '2026-10-08T10:00:00.000Z',
        }),
        expect.objectContaining({
          ruleId: 'repository.issue.stale.v1',
          fingerprint: 'integration-rule:repository.issue.stale.v1:provider:issue:42',
          occurredAt: '2026-10-08T10:00:00.000Z',
        }),
      ]),
    );
  });

  it('uses evaluation time for stale candidates so a previously resolved alert can reopen later', () => {
    const signal = workSignal('repository.issue', {}, { occurredAt: '2026-10-01T10:00:00.000Z' });
    const policy = {
      'repository.issue.stale.v1': { enabled: true, severity: 'warning' as const },
    };
    const first = deriveAlertsFromIntegrationSignal(signal, policy, {
      now: '2026-10-08T10:00:00.000Z',
    })[0];
    const later = deriveAlertsFromIntegrationSignal(signal, policy, {
      now: '2026-10-15T10:00:00.000Z',
    })[0];

    expect(Date.parse(later!.occurredAt)).toBeGreaterThan(Date.parse(first!.occurredAt));
    expect(later?.fingerprint).toBe(first?.fingerprint);
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