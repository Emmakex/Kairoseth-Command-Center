import { randomUUID } from 'node:crypto';
import { MongoServerError, type ClientSession, type Collection, type Db, type MongoClient } from 'mongodb';
import type { Scope, Task, TaskRecurrenceRule } from '@kcc/domain';
import { MongoAuditOutboxStore } from './audit-outbox.js';

export type RecurrenceMaterializationResult = {
  scannedTasks: number;
  candidates: number;
  created: number;
  existing: number;
  skipped: number;
};

type MaterializeOneResult = 'created' | 'existing' | 'skipped';

export type RecurrenceCandidate = {
  taskId: string;
  scope: Extract<Scope, { kind: 'workspace' | 'private' }>;
  sourceDueAt: string;
  nextDueAt: string;
  intervalDays: number;
};

function isRecurrenceScope(
  scope: Scope,
): scope is Extract<Scope, { kind: 'workspace' | 'private' }> {
  return scope.kind === 'workspace' || scope.kind === 'private';
}

function validIntervalRule(rule: TaskRecurrenceRule | undefined): rule is TaskRecurrenceRule {
  return (
    rule?.kind === 'interval_days' &&
    Number.isInteger(rule.intervalDays) &&
    rule.intervalDays >= 1 &&
    rule.intervalDays <= 365
  );
}

export function nextTaskRecurrenceDueAt(sourceDueAt: string, intervalDays: number): string {
  const sourceMs = Date.parse(sourceDueAt);
  if (!Number.isFinite(sourceMs)) throw new Error('task_recurrence_source_due_at_invalid');
  if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365) {
    throw new Error('task_recurrence_interval_invalid');
  }
  return new Date(sourceMs + intervalDays * 24 * 60 * 60_000).toISOString();
}

export function completedTaskRecurrenceCandidates(tasks: Task[]): RecurrenceCandidate[] {
  const candidates: RecurrenceCandidate[] = [];
  for (const task of tasks) {
    if (!isRecurrenceScope(task.scope) || task.status !== 'done') continue;
    if (task.recurrenceNextTaskId) continue;
    if (!task.completedAt || !Number.isFinite(Date.parse(task.completedAt))) continue;
    if (!task.dueAt || !Number.isFinite(Date.parse(task.dueAt))) continue;
    if (!validIntervalRule(task.recurrenceRule)) continue;

    candidates.push({
      taskId: task.id,
      scope: task.scope,
      sourceDueAt: task.dueAt,
      nextDueAt: nextTaskRecurrenceDueAt(task.dueAt, task.recurrenceRule.intervalDays),
      intervalDays: task.recurrenceRule.intervalDays,
    });
  }

  return candidates.sort((left, right) => {
    const due = left.nextDueAt.localeCompare(right.nextDueAt);
    return due !== 0 ? due : left.taskId.localeCompare(right.taskId);
  });
}

function scopeFilter(scope: Extract<Scope, { kind: 'workspace' | 'private' }>) {
  return scope.kind === 'workspace'
    ? { 'scope.kind': 'workspace' as const, 'scope.workspaceId': scope.workspaceId }
    : { 'scope.kind': 'private' as const, 'scope.userId': scope.userId };
}

function recurrenceCandidateFromTask(task: Task): RecurrenceCandidate | null {
  return completedTaskRecurrenceCandidates([task])[0] ?? null;
}

export class MongoTaskRecurrenceMaterializationStore {
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
    await Promise.all([
      this.tasks.createIndex({
        status: 1,
        'scope.kind': 1,
        'recurrenceRule.kind': 1,
        recurrenceNextTaskId: 1,
        completedAt: 1,
      }),
      this.tasks.createIndex(
        { 'scope.workspaceId': 1, recurrenceSourceTaskId: 1 },
        {
          unique: true,
          partialFilterExpression: {
            'scope.kind': 'workspace',
            recurrenceSourceTaskId: { $type: 'string' },
          },
        },
      ),
      this.tasks.createIndex(
        { 'scope.userId': 1, recurrenceSourceTaskId: 1 },
        {
          unique: true,
          partialFilterExpression: {
            'scope.kind': 'private',
            recurrenceSourceTaskId: { $type: 'string' },
          },
        },
      ),
      this.outbox.ensureIndexes(),
    ]);
  }

  private async transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = this.client.startSession();
    let result!: T;
    try {
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  private async reconcileExisting(candidate: RecurrenceCandidate): Promise<MaterializeOneResult> {
    const scoped = scopeFilter(candidate.scope);
    const existing = await this.tasks.findOne({
      ...scoped,
      recurrenceSourceTaskId: candidate.taskId,
    });
    if (!existing) return 'skipped';

    return this.transaction<MaterializeOneResult>(async (session) => {
      const source = await this.tasks.findOne(
        { ...scoped, id: candidate.taskId },
        { session },
      );
      if (!source) return 'existing';
      if (source.recurrenceNextTaskId === existing.id) return 'existing';
      if (source.recurrenceNextTaskId) return 'existing';

      const now = new Date().toISOString();
      await this.tasks.updateOne(
        { ...scoped, id: source.id, updatedAt: source.updatedAt, recurrenceNextTaskId: { $exists: false } },
        {
          $set: {
            recurrenceNextTaskId: existing.id,
            recurrenceMaterializedAt: now,
            updatedAt: now,
          },
        },
        { session },
      );
      return 'existing';
    });
  }

  private async materializeOne(candidate: RecurrenceCandidate): Promise<MaterializeOneResult> {
    const scoped = scopeFilter(candidate.scope);
    try {
      return await this.transaction<MaterializeOneResult>(async (session) => {
        const source = await this.tasks.findOne(
          {
            ...scoped,
            id: candidate.taskId,
            status: 'done',
            recurrenceNextTaskId: { $exists: false },
          },
          { session },
        );
        if (!source) return 'existing';

        const current = recurrenceCandidateFromTask(source);
        if (!current) return 'skipped';

        const now = new Date().toISOString();
        const nextTaskId = randomUUID();
        const sourceUpdate = await this.tasks.updateOne(
          {
            ...scoped,
            id: source.id,
            status: 'done',
            updatedAt: source.updatedAt,
            recurrenceNextTaskId: { $exists: false },
          },
          {
            $set: {
              recurrenceNextTaskId: nextTaskId,
              recurrenceMaterializedAt: now,
              updatedAt: now,
            },
          },
          { session },
        );
        if (sourceUpdate.matchedCount === 0) return 'skipped';

        const nextTask: Task = {
          id: nextTaskId,
          scope: current.scope,
          title: source.title,
          status: 'todo',
          priority: source.priority,
          assigneeIds: [...source.assigneeIds],
          recurrenceRule: { ...source.recurrenceRule! },
          recurrenceSourceTaskId: source.id,
          dueAt: current.nextDueAt,
          createdAt: now,
          updatedAt: now,
          ...(source.projectId ? { projectId: source.projectId } : {}),
          ...(source.description ? { description: source.description } : {}),
        };

        await this.tasks.insertOne(nextTask, { session });
        await this.outbox.enqueue(
          {
            scope: current.scope,
            type: 'task.recurrence_materialized',
            entityType: 'task',
            entityId: nextTask.id,
            summary: nextTask.title,
            source: 'task-recurrence',
            metadata: {
              sourceTaskId: source.id,
              nextTaskId: nextTask.id,
              sourceDueAt: current.sourceDueAt,
              nextDueAt: current.nextDueAt,
              intervalDays: current.intervalDays,
              copiedReminderRules: false,
              copiedDependencyIds: false,
            },
          },
          session,
        );

        return 'created';
      });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        return this.reconcileExisting(candidate);
      }
      throw error;
    }
  }

  async materializeCompleted(limit = 100): Promise<RecurrenceMaterializationResult> {
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const tasks = await this.tasks
      .find({
        'scope.kind': { $in: ['workspace', 'private'] },
        status: 'done',
        completedAt: { $type: 'string' },
        dueAt: { $type: 'string' },
        'recurrenceRule.kind': 'interval_days',
        recurrenceNextTaskId: { $exists: false },
      })
      .sort({ completedAt: 1, id: 1 })
      .limit(safeLimit)
      .toArray();

    const candidates = completedTaskRecurrenceCandidates(tasks).slice(0, safeLimit);
    let created = 0;
    let existing = 0;
    let skipped = 0;
    for (const candidate of candidates) {
      const result = await this.materializeOne(candidate);
      if (result === 'created') created += 1;
      else if (result === 'existing') existing += 1;
      else skipped += 1;
    }

    return {
      scannedTasks: tasks.length,
      candidates: candidates.length,
      created,
      existing,
      skipped,
    };
  }
}
