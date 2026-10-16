import { describe, expect, it } from 'vitest';
import type { Task } from '@kcc/domain';
import {
  activeDependencyImpactCounts,
  defaultPrioritizationWeights,
  rankOperationalPriorities,
} from '@kcc/domain';
import { effectivePrioritizationWeights } from '@kcc/persistence/prioritization-weight-policies';

const range = {
  start: '2026-10-16T00:00:00.000Z',
  end: '2026-10-17T00:00:00.000Z',
};

function task(id: string, dependencyIds: string[] = [], status: Task['status'] = 'todo'): Task {
  return {
    id,
    scope: { kind: 'workspace', workspaceId: 'workspace-a' },
    title: `Task ${id}`,
    status,
    priority: 0,
    assigneeIds: [],
    dependencyIds,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

describe('dependency-aware prioritization', () => {
  it('counts unique active downstream dependents across a transitive chain', () => {
    const tasks = [
      task('a'),
      task('b', ['a']),
      task('c', ['b']),
      task('d', ['a', 'b']),
    ];

    const counts = activeDependencyImpactCounts(tasks);
    expect(counts.get('a')).toBe(3);
    expect(counts.get('b')).toBe(2);
    expect(counts.get('c')).toBe(0);
    expect(counts.get('d')).toBe(0);
  });

  it('stops impact through completed or cancelled downstream work', () => {
    const tasks = [
      task('a'),
      task('done-middle', ['a'], 'done'),
      task('after-done', ['done-middle']),
      task('cancelled', ['a'], 'cancelled'),
    ];

    const counts = activeDependencyImpactCounts(tasks);
    expect(counts.get('a')).toBe(0);
  });

  it('adds one configurable contribution per unique active dependent and exposes the count', () => {
    const priorities = rankOperationalPriorities({
      tasks: [task('a'), task('b', ['a']), task('c', ['b'])],
      alerts: [],
      range,
      weights: {
        taskManualPriorityMax: 0,
        taskBlocked: 0,
        taskDependencyImpactPerDependent: 12,
        taskOverdue: 0,
        taskDueToday: 0,
      },
    });

    expect(priorities.map((item) => [item.id, item.score])).toEqual([
      ['a', 24],
      ['b', 12],
      ['c', 0],
    ]);
    expect(priorities[0]?.reasons).toEqual([
      { code: 'task.dependency_impact', contribution: 24, value: 2 },
    ]);
  });

  it('caps the dependency reason at 100 while keeping final scoring deterministic', () => {
    const root = task('root');
    const dependents = Array.from({ length: 12 }, (_, index) => task(`child-${index}`, ['root']));
    const [priority] = rankOperationalPriorities({
      tasks: [root, ...dependents],
      alerts: [],
      range,
      weights: {
        taskManualPriorityMax: 0,
        taskBlocked: 0,
        taskDependencyImpactPerDependent: 20,
        taskOverdue: 0,
        taskDueToday: 0,
      },
      limit: 1,
    });

    expect(priority).toMatchObject({
      id: 'root',
      score: 100,
      reasons: [{ code: 'task.dependency_impact', contribution: 100, value: 12 }],
    });
  });
});

describe('prioritization weight compatibility', () => {
  it('fills the new dependency weight for a legacy stored policy without changing existing values', () => {
    const defaults = defaultPrioritizationWeights();
    const legacy = { ...defaults } as Partial<typeof defaults>;
    delete legacy.taskDependencyImpactPerDependent;
    legacy.taskBlocked = 77;

    expect(effectivePrioritizationWeights(legacy)).toEqual({
      ...defaults,
      taskBlocked: 77,
      taskDependencyImpactPerDependent: 10,
    });
  });
});
