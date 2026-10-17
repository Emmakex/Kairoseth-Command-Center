import { describe, expect, it } from 'vitest';
import type { Project, Scope } from '@kcc/domain';
import {
  isProjectOverdue,
  overdueProjectDeadlineCandidates,
  projectDeadlineFingerprint,
} from '../src/project-deadline-alerts';

function project(input: {
  id: string;
  scope: Scope;
  status?: Project['status'];
  dueAt?: string;
}): Project {
  return {
    id: input.id,
    scope: input.scope,
    name: input.id,
    status: input.status ?? 'active',
    progress: 0,
    ...(input.dueAt ? { dueAt: input.dueAt } : {}),
    createdAt: '2026-10-17T08:00:00.000Z',
    updatedAt: '2026-10-17T08:00:00.000Z',
  };
}

describe('project deadline alerts', () => {
  it('selects overdue workspace and private projects deterministically', () => {
    const candidates = overdueProjectDeadlineCandidates(
      [
        project({
          id: 'workspace-later',
          scope: { kind: 'workspace', workspaceId: 'workspace-a' },
          dueAt: '2026-10-17T09:30:00.000Z',
        }),
        project({
          id: 'private-earlier',
          scope: { kind: 'private', userId: 'user-a' },
          dueAt: '2026-10-17T08:30:00.000Z',
        }),
      ],
      '2026-10-17T10:00:00.000Z',
    );

    expect(candidates).toEqual([
      {
        projectId: 'private-earlier',
        scope: { kind: 'private', userId: 'user-a' },
        dueAt: '2026-10-17T08:30:00.000Z',
      },
      {
        projectId: 'workspace-later',
        scope: { kind: 'workspace', workspaceId: 'workspace-a' },
        dueAt: '2026-10-17T09:30:00.000Z',
      },
    ]);
  });

  it('ignores future, missing, invalid, done, archived and system-scoped deadlines', () => {
    const now = '2026-10-17T10:00:00.000Z';
    const candidates = overdueProjectDeadlineCandidates(
      [
        project({ id: 'future', scope: { kind: 'workspace', workspaceId: 'workspace-a' }, dueAt: '2026-10-18T10:00:00.000Z' }),
        project({ id: 'missing', scope: { kind: 'workspace', workspaceId: 'workspace-a' } }),
        project({ id: 'invalid', scope: { kind: 'workspace', workspaceId: 'workspace-a' }, dueAt: 'not-a-date' }),
        project({ id: 'done', scope: { kind: 'workspace', workspaceId: 'workspace-a' }, status: 'done', dueAt: '2026-10-16T10:00:00.000Z' }),
        project({ id: 'archived', scope: { kind: 'private', userId: 'user-a' }, status: 'archived', dueAt: '2026-10-16T10:00:00.000Z' }),
        project({ id: 'system', scope: { kind: 'system', workspaceId: 'workspace-a', source: 'test' }, dueAt: '2026-10-16T10:00:00.000Z' }),
      ],
      now,
    );

    expect(candidates).toEqual([]);
  });

  it('treats the exact deadline instant as overdue and rejects invalid reconciliation time', () => {
    const exact = project({
      id: 'exact',
      scope: { kind: 'workspace', workspaceId: 'workspace-a' },
      dueAt: '2026-10-17T10:00:00.000Z',
    });

    expect(isProjectOverdue(exact, '2026-10-17T10:00:00.000Z')).toBe(true);
    expect(() => overdueProjectDeadlineCandidates([exact], 'invalid')).toThrow(
      'project_deadline_reconciliation_now_invalid',
    );
  });

  it('uses a stable project fingerprint', () => {
    expect(projectDeadlineFingerprint('project-1')).toBe('project-deadline:project-1');
  });
});
