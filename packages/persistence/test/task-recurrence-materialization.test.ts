import { describe, expect, it } from 'vitest';
import type { Scope, Task } from '@kcc/domain';
import {
  completedTaskRecurrenceCandidates,
  nextTaskRecurrenceDueAt,
} from '../src/task-recurrence-materialization';

function task(input: {
  id: string;
  scope: Scope;
  status?: Task['status'];
  dueAt?: string;
  completedAt?: string;
  intervalDays?: number;
  nextTaskId?: string;
}): Task {
  return {
    id: input.id,
    scope: input.scope,
    title: input.id,
    status: input.status ?? 'done',
    priority: 50,
    assigneeIds: [],
    ...(input.dueAt ? { dueAt: input.dueAt } : {}),
    ...(input.completedAt ? { completedAt: input.completedAt } : {}),
    ...(input.intervalDays !== undefined
      ? { recurrenceRule: { kind: 'interval_days' as const, intervalDays: input.intervalDays } }
      : {}),
    ...(input.nextTaskId ? { recurrenceNextTaskId: input.nextTaskId } : {}),
    createdAt: '2026-10-16T08:00:00.000Z',
    updatedAt: '2026-10-16T10:00:00.000Z',
  };
}

describe('task recurrence materialization candidates', () => {
  it('selects completed workspace and private recurrence deterministically', () => {
    expect(
      completedTaskRecurrenceCandidates([
        task({
          id: 'weekly',
          scope: { kind: 'workspace', workspaceId: 'workspace-a' },
          dueAt: '2026-10-20T09:00:00.000Z',
          completedAt: '2026-10-17T08:00:00.000Z',
          intervalDays: 7,
        }),
        task({
          id: 'daily',
          scope: { kind: 'private', userId: 'user-a' },
          dueAt: '2026-10-18T12:00:00.000Z',
          completedAt: '2026-10-17T09:00:00.000Z',
          intervalDays: 1,
        }),
      ]),
    ).toEqual([
      {
        taskId: 'daily',
        scope: { kind: 'private', userId: 'user-a' },
        sourceDueAt: '2026-10-18T12:00:00.000Z',
        nextDueAt: '2026-10-19T12:00:00.000Z',
        intervalDays: 1,
      },
      {
        taskId: 'weekly',
        scope: { kind: 'workspace', workspaceId: 'workspace-a' },
        sourceDueAt: '2026-10-20T09:00:00.000Z',
        nextDueAt: '2026-10-27T09:00:00.000Z',
        intervalDays: 7,
      },
    ]);
  });

  it('ignores incomplete, system, invalid and already-materialized tasks', () => {
    const source = {
      dueAt: '2026-10-20T09:00:00.000Z',
      completedAt: '2026-10-17T08:00:00.000Z',
      intervalDays: 7,
    };
    expect(
      completedTaskRecurrenceCandidates([
        task({ id: 'todo', scope: { kind: 'workspace', workspaceId: 'a' }, status: 'todo', ...source }),
        task({ id: 'system', scope: { kind: 'system', workspaceId: 'a', source: 'test' }, ...source }),
        task({ id: 'missing-due', scope: { kind: 'workspace', workspaceId: 'a' }, completedAt: source.completedAt, intervalDays: 7 }),
        task({ id: 'bad-due', scope: { kind: 'workspace', workspaceId: 'a' }, dueAt: 'bad', completedAt: source.completedAt, intervalDays: 7 }),
        task({ id: 'missing-completed', scope: { kind: 'workspace', workspaceId: 'a' }, dueAt: source.dueAt, intervalDays: 7 }),
        task({ id: 'bad-interval', scope: { kind: 'workspace', workspaceId: 'a' }, dueAt: source.dueAt, completedAt: source.completedAt, intervalDays: 0 }),
        task({ id: 'already', scope: { kind: 'workspace', workspaceId: 'a' }, nextTaskId: 'next', ...source }),
      ]),
    ).toEqual([]);
  });

  it('advances the exact UTC due instant by fixed whole days', () => {
    expect(nextTaskRecurrenceDueAt('2026-03-28T09:30:00.000Z', 2)).toBe(
      '2026-03-30T09:30:00.000Z',
    );
  });

  it('rejects invalid source instants and intervals', () => {
    expect(() => nextTaskRecurrenceDueAt('not-a-date', 7)).toThrow(
      'task_recurrence_source_due_at_invalid',
    );
    for (const intervalDays of [0, 366, 1.5]) {
      expect(() => nextTaskRecurrenceDueAt('2026-10-20T09:00:00.000Z', intervalDays)).toThrow(
        'task_recurrence_interval_invalid',
      );
    }
  });
});
