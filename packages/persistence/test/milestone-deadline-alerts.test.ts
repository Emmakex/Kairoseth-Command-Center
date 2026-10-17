import { describe, expect, it } from 'vitest';
import type { Milestone, Scope } from '@kcc/domain';
import {
  isMilestoneOverdue,
  milestoneDeadlineFingerprint,
  overdueMilestoneDeadlineCandidates,
} from '../src/milestone-deadline-alerts';

function milestone(input: {
  id: string;
  scope: Scope;
  status?: Milestone['status'];
  dueAt?: string;
}): Milestone {
  return {
    id: input.id,
    scope: input.scope,
    projectId: `project-${input.id}`,
    title: input.id,
    status: input.status ?? 'active',
    weight: 1,
    ...(input.dueAt ? { dueAt: input.dueAt } : {}),
    createdAt: '2026-10-17T08:00:00.000Z',
    updatedAt: '2026-10-17T08:00:00.000Z',
  };
}

describe('milestone deadline alerts', () => {
  it('selects overdue workspace and private milestones deterministically', () => {
    const candidates = overdueMilestoneDeadlineCandidates(
      [
        milestone({
          id: 'workspace-later',
          scope: { kind: 'workspace', workspaceId: 'workspace-a' },
          dueAt: '2026-10-17T09:30:00.000Z',
        }),
        milestone({
          id: 'private-earlier',
          scope: { kind: 'private', userId: 'user-a' },
          dueAt: '2026-10-17T08:30:00.000Z',
        }),
      ],
      '2026-10-17T10:00:00.000Z',
    );

    expect(candidates).toEqual([
      {
        milestoneId: 'private-earlier',
        projectId: 'project-private-earlier',
        scope: { kind: 'private', userId: 'user-a' },
        dueAt: '2026-10-17T08:30:00.000Z',
      },
      {
        milestoneId: 'workspace-later',
        projectId: 'project-workspace-later',
        scope: { kind: 'workspace', workspaceId: 'workspace-a' },
        dueAt: '2026-10-17T09:30:00.000Z',
      },
    ]);
  });

  it('ignores future, missing, invalid, done, cancelled and system-scoped deadlines', () => {
    const now = '2026-10-17T10:00:00.000Z';
    const candidates = overdueMilestoneDeadlineCandidates(
      [
        milestone({ id: 'future', scope: { kind: 'workspace', workspaceId: 'workspace-a' }, dueAt: '2026-10-18T10:00:00.000Z' }),
        milestone({ id: 'missing', scope: { kind: 'workspace', workspaceId: 'workspace-a' } }),
        milestone({ id: 'invalid', scope: { kind: 'workspace', workspaceId: 'workspace-a' }, dueAt: 'not-a-date' }),
        milestone({ id: 'done', scope: { kind: 'workspace', workspaceId: 'workspace-a' }, status: 'done', dueAt: '2026-10-16T10:00:00.000Z' }),
        milestone({ id: 'cancelled', scope: { kind: 'private', userId: 'user-a' }, status: 'cancelled', dueAt: '2026-10-16T10:00:00.000Z' }),
        milestone({ id: 'system', scope: { kind: 'system', workspaceId: 'workspace-a', source: 'test' }, dueAt: '2026-10-16T10:00:00.000Z' }),
      ],
      now,
    );

    expect(candidates).toEqual([]);
  });

  it('treats the exact deadline instant as overdue and rejects invalid reconciliation time', () => {
    const exact = milestone({
      id: 'exact',
      scope: { kind: 'workspace', workspaceId: 'workspace-a' },
      dueAt: '2026-10-17T10:00:00.000Z',
    });

    expect(isMilestoneOverdue(exact, '2026-10-17T10:00:00.000Z')).toBe(true);
    expect(() => overdueMilestoneDeadlineCandidates([exact], 'invalid')).toThrow(
      'milestone_deadline_reconciliation_now_invalid',
    );
  });

  it('uses a stable milestone fingerprint', () => {
    expect(milestoneDeadlineFingerprint('milestone-1')).toBe('milestone-deadline:milestone-1');
  });
});
