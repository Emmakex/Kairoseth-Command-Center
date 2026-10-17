import { randomUUID } from 'node:crypto';
import { MongoServerError, type ClientSession, type Collection, type Db, type MongoClient } from 'mongodb';
import type { Alert, Scope, Task } from '@kcc/domain';
import { MongoAuditOutboxStore } from './audit-outbox.js';

const TASK_DEADLINE_FINGERPRINT_PREFIX = 'task-deadline:';

type DeadlineScope = Extract<Scope, { kind: 'workspace' | 'private' }>;

export type TaskDeadlineCandidate = {
  taskId: string;
  scope: DeadlineScope;
  dueAt: string;
};

export type TaskDeadlineReconciliationResult = {
  scannedTasks: number;
  candidates: number;
  created: number;
  existing: number;
  reopened: number;
  resolved: number;
  skipped: number;
};

type MaterializeResult = 'created' | 'existing' | 'reopened' | 'skipped';

type ResolutionReason =
  | 'task_missing'
  | 'task_done'
  | 'task_cancelled'
  | 'deadline_missing_or_invalid'
  | 'deadline_not_overdue';

function isDeadlineScope(scope: Scope): scope is DeadlineScope {
  return scope.kind === 'workspace' || scope.kind === 'private';
}

function scopeFilter(scope: DeadlineScope) {
  return scope.kind === 'workspace'
    ? { 'scope.kind': 'workspace' as const, 'scope.workspaceId': scope.workspaceId }
    : { 'scope.kind': 'private' as const, 'scope.userId': scope.userId };
}

export function taskDeadlineFingerprint(taskId: string): string {
  return `${TASK_DEADLINE_FINGERPRINT_PREFIX}${taskId}`;
}

function taskIdFromDeadlineFingerprint(fingerprint: string | undefined): string | null {
  if (!fingerprint?.startsWith(TASK_DEADLINE_FINGERPRINT_PREFIX)) return null;
  const taskId = fingerprint.slice(TASK_DEADLINE_FINGERPRINT_PREFIX.length).trim();
  return taskId || null;
}

export function isTaskOverdue(task: Task, now: string): boolean {
  if (!isDeadlineScope(task.scope)) return false;
  if (task.status === 'done' || task.status === 'cancelled') return false;
  const nowMs = Date.parse(now);
  const dueAtMs = task.dueAt ? Date.parse(task.dueAt) : Number.NaN;
  return Number.isFinite(nowMs) && Number.isFinite(dueAtMs) && dueAtMs <= nowMs;
}

export function overdueTaskDeadlineCandidates(tasks: Task[], now: string): TaskDeadlineCandidate[] {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error('task_deadline_reconciliation_now_invalid');

  return tasks
    .filter((task) => isTaskOverdue(task, now) && isDeadlineScope(task.scope))
    .map((task) => ({ taskId: task.id, scope: task.scope as DeadlineScope, dueAt: task.dueAt! }))
    .sort((left, right) => {
      const due = left.dueAt.localeCompare(right.dueAt);
      return due !== 0 ? due : left.taskId.localeCompare(right.taskId);
    });
}

function resolutionReason(task: Task | null, now: string): ResolutionReason | null {
  if (!task) return 'task_missing';
  if (task.status === 'done') return 'task_done';
  if (task.status === 'cancelled') return 'task_cancelled';
  if (!task.dueAt || !Number.isFinite(Date.parse(task.dueAt))) return 'deadline_missing_or_invalid';
  return isTaskOverdue(task, now) ? null : 'deadline_not_overdue';
}

export class MongoTaskDeadlineAlertStore {
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
      this.tasks.createIndex({ 'scope.kind': 1, status: 1, dueAt: 1 }),
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

  private async materializeOne(candidate: TaskDeadlineCandidate, now: string): Promise<MaterializeResult> {
    const scoped = scopeFilter(candidate.scope);
    const fingerprint = taskDeadlineFingerprint(candidate.taskId);
    const alertFilter = { ...scoped, fingerprint };

    try {
      return await this.transaction<MaterializeResult>(async (session) => {
        const task = await this.tasks.findOne({ ...scoped, id: candidate.taskId }, { session });
        if (!task || !isTaskOverdue(task, now) || !task.dueAt) return 'skipped';

        const existing = await this.alerts.findOne(alertFilter, { session });
        if (existing) {
          if (existing.status === 'dismissed') return 'existing';
          if (existing.status !== 'resolved') return 'existing';

          const changedAt = new Date().toISOString();
          const update = await this.alerts.updateOne(
            { ...alertFilter, status: 'resolved', updatedAt: existing.updatedAt },
            {
              $set: {
                status: 'open',
                title: task.title,
                severity: 'urgent',
                updatedAt: changedAt,
                ...(task.projectId ? { projectId: task.projectId } : {}),
              },
              $unset: {
                acknowledgedAt: '',
                resolvedAt: '',
                ...(!task.projectId ? { projectId: '' } : {}),
              },
            },
            { session },
          );
          if (update.matchedCount === 0) return 'existing';

          const reopened = await this.alerts.findOne(alertFilter, { session });
          if (!reopened) throw new Error('task_deadline_alert_reopen_failed');
          await this.outbox.enqueue(
            {
              scope: candidate.scope,
              type: 'alert.reopened',
              entityType: 'alert',
              entityId: reopened.id,
              summary: reopened.title,
              source: 'task-deadlines',
              metadata: {
                taskId: task.id,
                dueAt: task.dueAt,
                cause: 'task_deadline_overdue',
                severity: reopened.severity,
              },
            },
            session,
          );
          return 'reopened';
        }

        const createdAt = new Date().toISOString();
        const alert: Alert = {
          id: randomUUID(),
          scope: candidate.scope,
          title: task.title,
          severity: 'urgent',
          status: 'open',
          fingerprint,
          createdAt,
          updatedAt: createdAt,
          ...(task.projectId ? { projectId: task.projectId } : {}),
        };

        const upsert = await this.alerts.updateOne(
          alertFilter,
          { $setOnInsert: alert },
          { upsert: true, session },
        );
        const stored = await this.alerts.findOne(alertFilter, { session });
        if (!stored) throw new Error('task_deadline_alert_materialization_failed');
        if (upsert.upsertedCount === 0) return 'existing';

        await this.outbox.enqueue(
          {
            scope: candidate.scope,
            type: 'alert.task_deadline_overdue',
            entityType: 'alert',
            entityId: stored.id,
            summary: stored.title,
            source: 'task-deadlines',
            metadata: {
              taskId: task.id,
              dueAt: task.dueAt,
              severity: stored.severity,
            },
          },
          session,
        );
        return 'created';
      });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const existing = await this.alerts.findOne(alertFilter);
        if (existing) return 'existing';
      }
      throw error;
    }
  }

  private async resolveOne(alert: Alert, now: string): Promise<boolean> {
    if (!isDeadlineScope(alert.scope)) return false;
    if (alert.status !== 'open' && alert.status !== 'acknowledged') return false;
    const fingerprint = alert.fingerprint;
    if (!fingerprint) return false;
    const taskId = taskIdFromDeadlineFingerprint(fingerprint);
    if (!taskId) return false;

    const scoped = scopeFilter(alert.scope);
    return this.transaction(async (session) => {
      const task = await this.tasks.findOne({ ...scoped, id: taskId }, { session });
      const reason = resolutionReason(task, now);
      if (!reason) return false;

      const changedAt = new Date().toISOString();
      const update = await this.alerts.updateOne(
        {
          ...scoped,
          id: alert.id,
          fingerprint,
          status: alert.status,
          updatedAt: alert.updatedAt,
        },
        { $set: { status: 'resolved', resolvedAt: changedAt, updatedAt: changedAt } },
        { session },
      );
      if (update.matchedCount === 0) return false;

      await this.outbox.enqueue(
        {
          scope: alert.scope,
          type: 'alert.auto_resolved',
          entityType: 'alert',
          entityId: alert.id,
          summary: `${alert.title}: resolved`,
          source: 'task-deadlines',
          metadata: {
            taskId,
            reason,
            ...(task?.dueAt ? { dueAt: task.dueAt } : {}),
          },
        },
        session,
      );
      return true;
    });
  }

  async reconcile(now: string, limit = 100): Promise<TaskDeadlineReconciliationResult> {
    const nowMs = Date.parse(now);
    if (!Number.isFinite(nowMs)) throw new Error('task_deadline_reconciliation_now_invalid');
    const normalizedNow = new Date(nowMs).toISOString();
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));

    const tasks = await this.tasks
      .find({
        'scope.kind': { $in: ['workspace', 'private'] },
        status: { $nin: ['done', 'cancelled'] },
        dueAt: { $type: 'string', $lte: normalizedNow },
      })
      .sort({ dueAt: 1, id: 1 })
      .limit(safeLimit)
      .toArray();

    const candidates = overdueTaskDeadlineCandidates(tasks, normalizedNow).slice(0, safeLimit);
    let created = 0;
    let existing = 0;
    let reopened = 0;
    let skipped = 0;
    for (const candidate of candidates) {
      const result = await this.materializeOne(candidate, normalizedNow);
      if (result === 'created') created += 1;
      else if (result === 'reopened') reopened += 1;
      else if (result === 'existing') existing += 1;
      else skipped += 1;
    }

    const resolvable = await this.alerts
      .find({
        'scope.kind': { $in: ['workspace', 'private'] },
        status: { $in: ['open', 'acknowledged'] },
        fingerprint: { $regex: `^${TASK_DEADLINE_FINGERPRINT_PREFIX}` },
      })
      .sort({ updatedAt: 1, id: 1 })
      .limit(safeLimit)
      .toArray();

    let resolved = 0;
    for (const alert of resolvable) {
      if (await this.resolveOne(alert, normalizedNow)) resolved += 1;
    }

    return {
      scannedTasks: tasks.length,
      candidates: candidates.length,
      created,
      existing,
      reopened,
      resolved,
      skipped,
    };
  }
}
