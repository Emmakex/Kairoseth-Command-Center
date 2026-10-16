import { describe, expect, it } from 'vitest';
import type { Scope, Task } from '@kcc/domain';
import {
  dueTaskReminderCandidates,
  taskReminderFingerprint,
} from '../src/task-reminder-alerts';

function task(input: {
  id: string;
  scope: Scope;
  status?: Task['status'];
  reminders?: string[];
}): Task {
  return {
    id: input.id,
    scope: input.scope,
    title: input.id,
    status: input.status ?? 'todo',
    priority: 50,
    assigneeIds: [],
    reminderRules: (input.reminders ?? []).map((remindAt) => ({ kind: 'at', remindAt })),
    createdAt: '2026-10-16T08:00:00.000Z',
    updatedAt: '2026-10-16T08:00:00.000Z',
  };
}

describe('task reminder alert candidates', () => {
  it('selects due workspace and private reminders deterministically', () => {
    const candidates = dueTaskReminderCandidates(
      [
        task({
          id: 'workspace-task',
          scope: { kind: 'workspace', workspaceId: 'workspace-a' },
          reminders: ['2026-10-16T09:00:00.000Z', '2026-10-16T12:00:00.000Z'],
        }),
        task({
          id: 'private-task',
          scope: { kind: 'private', userId: 'user-a' },
          reminders: ['2026-10-16T08:30:00.000Z'],
        }),
      ],
      '2026-10-16T10:00:00.000Z',
    );

    expect(candidates).toEqual([
      {
        taskId: 'private-task',
        scope: { kind: 'private', userId: 'user-a' },
        remindAt: '2026-10-16T08:30:00.000Z',
      },
      {
        taskId: 'workspace-task',
        scope: { kind: 'workspace', workspaceId: 'workspace-a' },
        remindAt: '2026-10-16T09:00:00.000Z',
      },
    ]);
  });

  it('ignores completed, cancelled, future and system-scoped reminders', () => {
    const candidates = dueTaskReminderCandidates(
      [
        task({
          id: 'done',
          scope: { kind: 'workspace', workspaceId: 'workspace-a' },
          status: 'done',
          reminders: ['2026-10-16T09:00:00.000Z'],
        }),
        task({
          id: 'cancelled',
          scope: { kind: 'private', userId: 'user-a' },
          status: 'cancelled',
          reminders: ['2026-10-16T09:00:00.000Z'],
        }),
        task({
          id: 'future',
          scope: { kind: 'workspace', workspaceId: 'workspace-a' },
          reminders: ['2026-10-17T09:00:00.000Z'],
        }),
        task({
          id: 'system',
          scope: { kind: 'system', workspaceId: 'workspace-a', source: 'test' },
          reminders: ['2026-10-16T09:00:00.000Z'],
        }),
      ],
      '2026-10-16T10:00:00.000Z',
    );

    expect(candidates).toEqual([]);
  });

  it('uses a stable task-and-instant fingerprint', () => {
    expect(taskReminderFingerprint('task-1', '2026-10-16T09:00:00.000Z')).toBe(
      'task-reminder:task-1:2026-10-16T09:00:00.000Z',
    );
  });
});
