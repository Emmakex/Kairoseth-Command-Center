import { describe, expect, it } from 'vitest';
import type { Scope, Task } from '@kcc/domain';
import {
  isTaskOverdue,
  overdueTaskDeadlineCandidates,
  taskDeadlineFingerprint,
} from '../src/task-deadline-alerts';

function task(input: {
  id: string;
  scope: Scope;
  status?: Task['status'];
  dueAt?: string;
}): Task {
  return {
    id: input.id,
    scope: input.scope,
    title: input.id,
    status: input.status ?? 'todo',
    priority: 50,
    assigneeIds: [],
    ...(input.dueAt ? { dueAt: input.dueAt } : {}),
    createdAt: '2026-10-17T08:00:00.000Z',
    updatedAt: '2026-10-17T08:00:00.000Z',
  };
}

describe('task deadline alerts', () => {
  it('selects overdue workspace and private tasks deterministically', () => {
    const candidates = overdueTaskDeadlineCandidates(
      [
        task({
          id: 'workspace-later',
          scope: { kind: 'workspace', workspaceId: 'workspace-a' },
          dueAt: '2026-10-17T09:30:00.000Z',
        }),
        task({
          id: 'private-earlier',
          scope: { kind: 'private', userId: 'user-a' },
          dueAt: '2026-10-17T08:30:00.000Z',
        }),
      ],
      '2026-10-17T10:00:00.000Z',
    );

    expect(candidates).toEqual([
      {
        taskId: 'private-earlier',
        scope: { kind: 'private', userId: 'user-a' },
        dueAt: '2026-10-17T08:30:00.000Z',
      },
      {
        taskId: 'workspace-later',
        scope: { kind: 'workspace', workspaceId: 'workspace-a' },
        dueAt: '2026-10-17T09:30:00.000Z',
      },
    ]);
  });

  it('ignores future, missing, invalid, completed, cancelled and system-scoped deadlines', () => {
    const now = '2026-10-17T10:00:00.000Z';
    const candidates = overdueTaskDeadlineCandidates(
      [
        task({ id: 'future', scope: { kind: 'workspace', workspaceId: 'workspace-a' }, dueAt: '2026-10-18T10:00:00.000Z' }),
        task({ id: 'missing', scope: { kind: 'workspace', workspaceId: 'workspace-a' } }),
        task({ id: 'invalid', scope: { kind: 'workspace', workspaceId: 'workspace-a' }, dueAt: 'not-a-date' }),
        task({ id: 'done', scope: { kind: 'workspace', workspaceId: 'workspace-a' }, status: 'done', dueAt: '2026-10-16T10:00:00.000Z' }),
        task({ id: 'cancelled', scope: { kind: 'private', userId: 'user-a' }, status: 'cancelled', dueAt: '2026-10-16T10:00:00.000Z' }),
        task({ id: 'system', scope: { kind: 'system', workspaceId: 'workspace-a', source: 'test' }, dueAt: '2026-10-16T10:00:00.000Z' }),
      ],
      now,
    );

    expect(candidates).toEqual([]);
  });

  it('treats the exact deadline instant as overdue and rejects invalid reconciliation time', () => {
    const exact = task({
      id: 'exact',
      scope: { kind: 'workspace', workspaceId: 'workspace-a' },
      dueAt: '2026-10-17T10:00:00.000Z',
    });

    expect(isTaskOverdue(exact, '2026-10-17T10:00:00.000Z')).toBe(true);
    expect(() => overdueTaskDeadlineCandidates([exact], 'invalid')).toThrow(
      'task_deadline_reconciliation_now_invalid',
    );
  });

  it('uses a stable task fingerprint', () => {
    expect(taskDeadlineFingerprint('task-1')).toBe('task-deadline:task-1');
  });
});
