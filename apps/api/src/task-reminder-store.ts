import type { Collection, Db, MongoClient } from 'mongodb';
import type { Scope, Task, TaskReminderRule } from '@kcc/domain';
import { MongoAuditOutboxStore } from '@kcc/persistence/audit-outbox';

export const MAX_TASK_REMINDERS = 10;

export type TaskReminderResult =
  | { ok: true; task: Task }
  | { ok: false; error: 'task_not_found' | 'reminder_update_conflict' };

export interface TaskReminderStore {
  ensureIndexes(): Promise<void>;
  setReminderRules(input: {
    scope: Scope;
    actorUserId: string;
    taskId: string;
    reminderRules: TaskReminderRule[];
  }): Promise<TaskReminderResult>;
}

export function normalizeTaskReminderRules(reminderRules: TaskReminderRule[]): TaskReminderRule[] {
  if (reminderRules.length > MAX_TASK_REMINDERS) {
    throw new Error('task_reminder_limit_exceeded');
  }

  const normalized = reminderRules.map((rule) => {
    if (rule.kind !== 'at' || typeof rule.remindAt !== 'string') {
      throw new Error('task_reminder_invalid');
    }
    const timestamp = Date.parse(rule.remindAt);
    if (!Number.isFinite(timestamp)) throw new Error('task_reminder_invalid');
    return { kind: 'at' as const, remindAt: new Date(timestamp).toISOString() };
  });

  const instants = normalized.map((rule) => rule.remindAt);
  if (new Set(instants).size !== instants.length) {
    throw new Error('task_reminder_duplicate');
  }

  return normalized.sort((left, right) => left.remindAt.localeCompare(right.remindAt));
}

export class MongoTaskReminderStore implements TaskReminderStore {
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

  async setReminderRules(input: {
    scope: Scope;
    actorUserId: string;
    taskId: string;
    reminderRules: TaskReminderRule[];
  }): Promise<TaskReminderResult> {
    const reminderRules = normalizeTaskReminderRules(input.reminderRules);
    const session = this.client.startSession();
    let outcome: TaskReminderResult = { ok: false, error: 'reminder_update_conflict' };

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

        const now = new Date().toISOString();
        const update = await this.tasks.updateOne(
          { scope: input.scope, id: task.id, updatedAt: task.updatedAt },
          { $set: { reminderRules, updatedAt: now } },
          { session },
        );
        if (update.matchedCount === 0) {
          outcome = { ok: false, error: 'reminder_update_conflict' };
          return;
        }

        const updated: Task = { ...task, reminderRules, updatedAt: now };
        await this.outbox.enqueue(
          {
            scope: input.scope,
            type: 'task.reminders_changed',
            actorUserId: input.actorUserId,
            entityType: 'task',
            entityId: task.id,
            summary: task.title,
            source: 'manual-api',
            metadata: {
              previousReminderRules: task.reminderRules ?? [],
              reminderRules,
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
