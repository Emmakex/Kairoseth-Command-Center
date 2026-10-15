import { describe, expect, it } from 'vitest';
import type { IntegrationSignal } from '@kcc/integrations';
import { deriveAlertsFromIntegrationSignal } from '@kcc/integrations/signal-alert-rules';

function ciSignal(payload: Record<string, unknown>): IntegrationSignal {
  return {
    id: 'provider:workflow-run:701',
    source: 'provider-x',
    type: 'repository.ci',
    workspaceId: 'workspace-a',
    occurredAt: '2026-10-15T10:00:00.000Z',
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

  it('ignores non-CI signals even if their payload contains a failure-like field', () => {
    const signal: IntegrationSignal = {
      ...ciSignal({ conclusion: 'failure' }),
      type: 'repository.issue',
    };
    expect(deriveAlertsFromIntegrationSignal(signal)).toEqual([]);
  });
});
