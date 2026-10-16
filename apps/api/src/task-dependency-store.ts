import type { ClientSession, Collection, Db, MongoClient } from 'mongodb';
import type { Scope, Task } from '@kcc/domain';
import { MongoAuditOutboxStore } from '@kcc/persistence/audit-outbox';

export const MAX_TASK_DEPENDENCIES = 50;

export type TaskDependencyError =
  | 'task_not_found'
  | 'dependency_not_found'
  | 'self_dependency'
  | 'dependency_cycle'
  | 'dependency_update_conflict';

export type TaskDependencyResult =
  | { ok: true; task: Task }
  | { ok: false; error: TaskDependencyError; dependencyId?: string };

export interface TaskDependencyStore {
  ensureIndexes(): Promise<void>;
  setDependencies(input: {
    scope: Scope;
    actorUserId: string;
    taskId: string;
    dependencyIds: string[];
  }): Promise<TaskDependencyResult>;
}

export function hasTaskDependencyCycle(
  tasks: Array<Pick<Task, 'id' | 'dependencyIds'>>,
  taskId: string,
  dependencyIds: string[],
): boolean {
  const graph = new Map(tasks.map((task) => [task.id, task.dependencyIds ?? []] as const));
  graph.set(taskId, dependencyIds);

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependencyId of graph.get(id) ?? []) {
      if (visit(dependencyId)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  return visit(taskId);
}

function normalizeDependencyIds(dependencyIds: string[]): string[] {
  if (dependencyIds.length > MAX_TASK_DEPENDENCIES) {
    throw new Error('task_dependency_limit_exceeded');
  }
  const normalized = dependencyIds.map((value) => value.trim());
  if (normalized.some((value) => !value || value.length > 100)) {
    throw new Error('task_dependency_id_invalid');
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('task_dependency_duplicate');
  }
  return normalized;
}

export class MongoTaskDependencyStore implements TaskDependencyStore {
  private readonly tasks: Collection<Task>;
  private readonly outbox: MongoAuditOutboxStore;

  constructor(
    private readonly client: MongoClient,
    db: Db,
  ) {
    this.tasks = db.collection<Task>('tasks');
    this.outbox = new MongoAuditOutboxStore(db);
  }

  async ensureIndexes(): Promise<void> {
    await this.outbox.ensureIndexes();
  }

  async setDependencies(input: {
    scope: Scope;
    actorUserId: string;
    taskId: string;
    dependencyIds: string[];
  }): Promise<TaskDependencyResult> {
    const dependencyIds = normalizeDependencyIds(input.dependencyIds);
    const session = this.client.startSession();
    let outcome: TaskDependencyResult = { ok: false, error: 'dependency_update_conflict' };

    try {
      await session.withTransaction(async () => {
        const task = await this.tasks.findOne(
          { scope: input.scope, id: input.taskId },
          { session },
        );
        if (!task) {
          outcome = { ok: false, error: 'task_not_found' };
          return;
        }
        if (dependencyIds.includes(task.id)) {
          outcome = { ok: false, error: 'self_dependency', dependencyId: task.id };
          return;
        }

        const scopedTasks = await this.tasks.find({ scope: input.scope }, { session }).toArray();
        const scopedIds = new Set(scopedTasks.map((candidate) => candidate.id));
        const missingDependency = dependencyIds.find((dependencyId) => !scopedIds.has(dependencyId));
        if (missingDependency) {
          outcome = {
            ok: false,
            error: 'dependency_not_found',
            dependencyId: missingDependency,
          };
          return;
        }

        if (hasTaskDependencyCycle(scopedTasks, task.id, dependencyIds)) {
          outcome = { ok: false, error: 'dependency_cycle' };
          return;
        }

        const now = new Date().toISOString();
        const update = await this.tasks.updateOne(
          { scope: input.scope, id: task.id, updatedAt: task.updatedAt },
          { $set: { dependencyIds, updatedAt: now } },
          { session },
        );
        if (update.matchedCount === 0) {
          outcome = { ok: false, error: 'dependency_update_conflict' };
          return;
        }

        const updated: Task = { ...task, dependencyIds, updatedAt: now };
        await this.outbox.enqueue(
          {
            scope: input.scope,
            type: 'task.dependencies_changed',
            actorUserId: input.actorUserId,
            entityType: 'task',
            entityId: task.id,
            summary: task.title,
            source: 'manual-api',
            metadata: {
              previousDependencyIds: task.dependencyIds ?? [],
              dependencyIds,
            },
          },
          session,
        );
        outcome = { ok: true, task: updated };
      });
      return outcome;
    } finally {
      await session.endSession();
    }
  }
}
