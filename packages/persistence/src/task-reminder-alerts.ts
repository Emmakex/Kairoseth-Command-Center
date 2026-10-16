import { randomUUID } from 'node:crypto';
import { MongoServerError, type ClientSession, type Collection, type Db, type MongoClient } from 'mongodb';
import type { Alert, Scope, Task, TaskReminderRule } from '@kcc/domain';
import { MongoAuditOutboxStore } from './audit-outbox.js';

export type ReminderMaterializationResult = {
  scannedTasks: number;
  candidates: number;
  created: number;
  existing: number;
  skipped: number;
};

type MaterializeOneResult = 'created' | 'existing' | 'skipped';

type ReminderCandidate = {
  taskId: string;
  scope: Extract<Scope, { kind: 'workspace' | 'private' }>;
  remindAt: string;
};

function isReminderScope(scope: Scope): scope is Extract<Scope, { kind: 'workspace' | 'private' }> {
  return scope.kind === 'workspace' || scope.kind === 'private';
}

export function taskReminderFingerprint(taskId: string, remindAt: string): string {
  return `task-reminder:${taskId}:${remindAt}`;
}

export function dueTaskReminderCandidates(tasks: Task[], now: string): ReminderCandidate[] {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error('task_reminder_materialization_now_invalid');

  const candidates: ReminderCandidate[] = [];
  for (const task of tasks) {
    if (!isReminderScope(task.scope) || task.status === 'done' || task.status === 'cancelled') continue;
    for (const rule of task.reminderRules ?? []) {
      if (rule.kind !== 'at') continue;
      const remindAtMs = Date.parse(rule.remindAt);
      if (!Number.isFinite(remindAtMs) || remindAtMs > nowMs) continue;
      candidates.push({ taskId: task.id, scope: task.scope, remindAt: rule.remindAt });
    }
  }

  return candidates.sort((left, right) => {
    const time = left.remindAt.localeCompare(right.remindAt);
    return time !== 0 ? time : left.taskId.localeCompare(right.taskId);
  });
}

function scopeFilter(scope: Extract<Scope, { kind: 'workspace' | 'private' }>) {
  return scope.kind === 'workspace'
    ? { 'scope.kind': 'workspace' as const, 'scope.workspaceId': scope.workspaceId }
    : { 'scope.kind': 'private' as const, 'scope.userId': scope.userId };
}

function hasReminder(task: Task, remindAt: string): boolean {
  return (task.reminderRules ?? []).some(
    (rule: TaskReminderRule) => rule.kind === 'at' && rule.remindAt === remindAt,
  );
}

export class MongoTaskReminderAlertStore {
  private readonly tasks: Collection<Task>;
  private readonly alerts: Collection<Alert>;
  private readonly outbox: MongoAuditOutboxStore;

  constructor(
    private readonly client: MongoClient,
    db: Db,
  ) {
    this.tasks = db.collection<Task>('tasks');
    this.alerts = db.collection<Alert>('alerts');
    this.outbox = new MongoAuditOutboxStore(db);
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.tasks.createIndex({ status: 1, 'scope.kind': 1, 'reminderRules.remindAt': 1 }),
      this.alerts.createIndex(
        { 'scope.workspaceId': 1, fingerprint: 1 },
        {
          unique: true,
          partialFilterExpression: {
            'scope.kind': 'workspace',
            fingerprint: { $type: 'string' },
          },
        },
      ),
      this.alerts.createIndex(
        { 'scope.userId': 1, fingerprint: 1 },
        {
          unique: true,
          partialFilterExpression: {
            'scope.kind': 'private',
            fingerprint: { $type: 'string' },
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

  private async materializeOne(candidate: ReminderCandidate): Promise<MaterializeOneResult> {
    const fingerprint = taskReminderFingerprint(candidate.taskId, candidate.remindAt);
    const scoped = scopeFilter(candidate.scope);
    const alertFilter = { ...scoped, fingerprint };

    try {
      return await this.transaction(async (session) => {
        const task = await this.tasks.findOne(
          {
            ...scoped,
            id: candidate.taskId,
            status: { $nin: ['done', 'cancelled'] },
          },
          { session },
        );
        if (!task || !hasReminder(task, candidate.remindAt)) return 'skipped';

        const existing = await this.alerts.findOne(alertFilter, { session });
        if (existing) return 'existing';

        const now = new Date().toISOString();
        const alert: Alert = {
          id: randomUUID(),
          scope: candidate.scope,
          title: task.title,
          severity: 'warning',
          status: 'open',
          fingerprint,
          createdAt: now,
          updatedAt: now,
          ...(task.projectId ? { projectId: task.projectId } : {}),
        };

        const upsert = await this.alerts.updateOne(
          alertFilter,
          { $setOnInsert: alert },
          { upsert: true, session },
        );
        const stored = await this.alerts.findOne(alertFilter, { session });
        if (!stored) throw new Error('task_reminder_alert_materialization_failed');
        if (upsert.upsertedCount === 0) return 'existing';

        await this.outbox.enqueue(
          {
            scope: candidate.scope,
            type: 'alert.reminder_due',
            entityType: 'alert',
            entityId: stored.id,
            summary: task.title,
            source: 'task-reminders',
            metadata: {
              taskId: task.id,
              remindAt: candidate.remindAt,
              severity: stored.severity,
            },
          },
          session,
        );
        return 'created';
      });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const concurrent = await this.alerts.findOne(alertFilter);
        if (concurrent) return 'existing';
      }
      throw error;
    }
  }

  async materializeDue(now: string, limit = 100): Promise<ReminderMaterializationResult> {
    const nowMs = Date.parse(now);
    if (!Number.isFinite(nowMs)) throw new Error('task_reminder_materialization_now_invalid');
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));

    const tasks = await this.tasks
      .find({
        'scope.kind': { $in: ['workspace', 'private'] },
        status: { $nin: ['done', 'cancelled'] },
        reminderRules: {
          $elemMatch: {
            kind: 'at',
            remindAt: { $lte: new Date(nowMs).toISOString() },
          },
        },
      })
      .sort({ 'reminderRules.remindAt': 1, id: 1 })
      .limit(safeLimit)
      .toArray();

    const candidates = dueTaskReminderCandidates(tasks, now).slice(0, safeLimit);
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
