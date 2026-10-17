import type { Collection, Db, MongoClient } from 'mongodb';
import type { Scope, Task, TaskRecurrenceRule } from '@kcc/domain';
import { MongoAuditOutboxStore } from '@kcc/persistence/audit-outbox';

export const MIN_TASK_RECURRENCE_DAYS = 1;
export const MAX_TASK_RECURRENCE_DAYS = 365;

export type TaskRecurrenceResult =
  | { ok: true; task: Task }
  | {
      ok: false;
      error:
        | 'task_not_found'
        | 'task_recurrence_requires_due_at'
        | 'recurrence_update_conflict';
    };

export interface TaskRecurrenceStore {
  ensureIndexes(): Promise<void>;
  setRecurrenceRule(input: {
    scope: Scope;
    actorUserId: string;
    taskId: string;
    recurrenceRule: TaskRecurrenceRule | null;
  }): Promise<TaskRecurrenceResult>;
}

export function normalizeTaskRecurrenceRule(
  recurrenceRule: TaskRecurrenceRule | null,
): TaskRecurrenceRule | null {
  if (recurrenceRule === null) return null;
  if (
    recurrenceRule.kind !== 'interval_days' ||
    !Number.isInteger(recurrenceRule.intervalDays) ||
    recurrenceRule.intervalDays < MIN_TASK_RECURRENCE_DAYS ||
    recurrenceRule.intervalDays > MAX_TASK_RECURRENCE_DAYS
  ) {
    throw new Error('task_recurrence_invalid');
  }
  return { kind: 'interval_days', intervalDays: recurrenceRule.intervalDays };
}

export class MongoTaskRecurrenceStore implements TaskRecurrenceStore {
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

  async setRecurrenceRule(input: {
    scope: Scope;
    actorUserId: string;
    taskId: string;
    recurrenceRule: TaskRecurrenceRule | null;
  }): Promise<TaskRecurrenceResult> {
    const recurrenceRule = normalizeTaskRecurrenceRule(input.recurrenceRule);
    const session = this.client.startSession();
    let outcome: TaskRecurrenceResult = { ok: false, error: 'recurrence_update_conflict' };

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

        if (
          recurrenceRule &&
          (typeof task.dueAt !== 'string' || !Number.isFinite(Date.parse(task.dueAt)))
        ) {
          outcome = { ok: false, error: 'task_recurrence_requires_due_at' };
          return;
        }

        const now = new Date().toISOString();
        const update = await this.tasks.updateOne(
          { scope: input.scope, id: task.id, updatedAt: task.updatedAt },
          recurrenceRule
            ? { $set: { recurrenceRule, updatedAt: now } }
            : { $unset: { recurrenceRule: '' }, $set: { updatedAt: now } },
          { session },
        );
        if (update.matchedCount === 0) {
          outcome = { ok: false, error: 'recurrence_update_conflict' };
          return;
        }

        const updated: Task = { ...task, updatedAt: now };
        if (recurrenceRule) updated.recurrenceRule = recurrenceRule;
        else delete updated.recurrenceRule;

        await this.outbox.enqueue(
          {
            scope: input.scope,
            type: 'task.recurrence_changed',
            actorUserId: input.actorUserId,
            entityType: 'task',
            entityId: task.id,
            summary: task.title,
            source: 'manual-api',
            metadata: {
              previousRecurrenceRule: task.recurrenceRule ?? null,
              recurrenceRule,
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
