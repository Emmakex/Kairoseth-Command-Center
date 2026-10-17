import { randomUUID } from 'node:crypto';
import { MongoServerError, type ClientSession, type Collection, type Db, type MongoClient } from 'mongodb';
import type { Alert, Milestone, Scope } from '@kcc/domain';
import { MongoAuditOutboxStore } from './audit-outbox.js';

const MILESTONE_DEADLINE_FINGERPRINT_PREFIX = 'milestone-deadline:';

type DeadlineScope = Extract<Scope, { kind: 'workspace' | 'private' }>;

export type MilestoneDeadlineCandidate = {
  milestoneId: string;
  projectId: string;
  scope: DeadlineScope;
  dueAt: string;
};

export type MilestoneDeadlineReconciliationResult = {
  scannedMilestones: number;
  candidates: number;
  created: number;
  existing: number;
  reopened: number;
  resolved: number;
  skipped: number;
};

type MaterializeResult = 'created' | 'existing' | 'reopened' | 'skipped';

type ResolutionReason =
  | 'milestone_missing'
  | 'milestone_done'
  | 'milestone_cancelled'
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

export function milestoneDeadlineFingerprint(milestoneId: string): string {
  return `${MILESTONE_DEADLINE_FINGERPRINT_PREFIX}${milestoneId}`;
}

function milestoneIdFromDeadlineFingerprint(fingerprint: string | undefined): string | null {
  if (!fingerprint?.startsWith(MILESTONE_DEADLINE_FINGERPRINT_PREFIX)) return null;
  const milestoneId = fingerprint.slice(MILESTONE_DEADLINE_FINGERPRINT_PREFIX.length).trim();
  return milestoneId || null;
}

export function isMilestoneOverdue(milestone: Milestone, now: string): boolean {
  if (!isDeadlineScope(milestone.scope)) return false;
  if (milestone.status === 'done' || milestone.status === 'cancelled') return false;
  const nowMs = Date.parse(now);
  const dueAtMs = milestone.dueAt ? Date.parse(milestone.dueAt) : Number.NaN;
  return Number.isFinite(nowMs) && Number.isFinite(dueAtMs) && dueAtMs <= nowMs;
}

export function overdueMilestoneDeadlineCandidates(
  milestones: Milestone[],
  now: string,
): MilestoneDeadlineCandidate[] {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error('milestone_deadline_reconciliation_now_invalid');

  return milestones
    .filter((milestone) => isMilestoneOverdue(milestone, now) && isDeadlineScope(milestone.scope))
    .map((milestone) => ({
      milestoneId: milestone.id,
      projectId: milestone.projectId,
      scope: milestone.scope as DeadlineScope,
      dueAt: milestone.dueAt!,
    }))
    .sort((left, right) => {
      const due = left.dueAt.localeCompare(right.dueAt);
      return due !== 0 ? due : left.milestoneId.localeCompare(right.milestoneId);
    });
}

function resolutionReason(milestone: Milestone | null, now: string): ResolutionReason | null {
  if (!milestone) return 'milestone_missing';
  if (milestone.status === 'done') return 'milestone_done';
  if (milestone.status === 'cancelled') return 'milestone_cancelled';
  if (!milestone.dueAt || !Number.isFinite(Date.parse(milestone.dueAt))) {
    return 'deadline_missing_or_invalid';
  }
  return isMilestoneOverdue(milestone, now) ? null : 'deadline_not_overdue';
}

export class MongoMilestoneDeadlineAlertStore {
  private readonly milestones: Collection<Milestone>;
  private readonly alerts: Collection<Alert>;
  private readonly outbox: MongoAuditOutboxStore;

  constructor(
    private readonly client: MongoClient,
    db: Db,
  ) {
    this.milestones = db.collection<Milestone>('milestones');
    this.alerts = db.collection<Alert>('alerts');
    this.outbox = new MongoAuditOutboxStore(db);
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.milestones.createIndex({ 'scope.kind': 1, status: 1, dueAt: 1 }),
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

  private async materializeOne(candidate: MilestoneDeadlineCandidate, now: string): Promise<MaterializeResult> {
    const scoped = scopeFilter(candidate.scope);
    const fingerprint = milestoneDeadlineFingerprint(candidate.milestoneId);
    const alertFilter = { ...scoped, fingerprint };

    try {
      return await this.transaction<MaterializeResult>(async (session) => {
        const milestone = await this.milestones.findOne(
          { ...scoped, id: candidate.milestoneId },
          { session },
        );
        if (!milestone || !isMilestoneOverdue(milestone, now) || !milestone.dueAt) return 'skipped';

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
                title: milestone.title,
                severity: 'urgent',
                projectId: milestone.projectId,
                updatedAt: changedAt,
              },
              $unset: { acknowledgedAt: '', resolvedAt: '' },
            },
            { session },
          );
          if (update.matchedCount === 0) return 'existing';

          const reopened = await this.alerts.findOne(alertFilter, { session });
          if (!reopened) throw new Error('milestone_deadline_alert_reopen_failed');
          await this.outbox.enqueue(
            {
              scope: candidate.scope,
              type: 'alert.reopened',
              entityType: 'alert',
              entityId: reopened.id,
              summary: reopened.title,
              source: 'milestone-deadlines',
              metadata: {
                milestoneId: milestone.id,
                projectId: milestone.projectId,
                dueAt: milestone.dueAt,
                cause: 'milestone_deadline_overdue',
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
          projectId: milestone.projectId,
          title: milestone.title,
          severity: 'urgent',
          status: 'open',
          fingerprint,
          createdAt,
          updatedAt: createdAt,
        };

        const upsert = await this.alerts.updateOne(
          alertFilter,
          { $setOnInsert: alert },
          { upsert: true, session },
        );
        const stored = await this.alerts.findOne(alertFilter, { session });
        if (!stored) throw new Error('milestone_deadline_alert_materialization_failed');
        if (upsert.upsertedCount === 0) return 'existing';

        await this.outbox.enqueue(
          {
            scope: candidate.scope,
            type: 'alert.milestone_deadline_overdue',
            entityType: 'alert',
            entityId: stored.id,
            summary: stored.title,
            source: 'milestone-deadlines',
            metadata: {
              milestoneId: milestone.id,
              projectId: milestone.projectId,
              dueAt: milestone.dueAt,
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
    const milestoneId = milestoneIdFromDeadlineFingerprint(fingerprint);
    if (!milestoneId) return false;

    const scoped = scopeFilter(alert.scope);
    return this.transaction(async (session) => {
      const milestone = await this.milestones.findOne({ ...scoped, id: milestoneId }, { session });
      const reason = resolutionReason(milestone, now);
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
          source: 'milestone-deadlines',
          metadata: {
            milestoneId,
            projectId: milestone?.projectId ?? alert.projectId,
            reason,
            ...(milestone?.dueAt ? { dueAt: milestone.dueAt } : {}),
          },
        },
        session,
      );
      return true;
    });
  }

  async reconcile(now: string, limit = 100): Promise<MilestoneDeadlineReconciliationResult> {
    const nowMs = Date.parse(now);
    if (!Number.isFinite(nowMs)) throw new Error('milestone_deadline_reconciliation_now_invalid');
    const normalizedNow = new Date(nowMs).toISOString();
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));

    const milestones = await this.milestones
      .find({
        'scope.kind': { $in: ['workspace', 'private'] },
        status: { $nin: ['done', 'cancelled'] },
        dueAt: { $type: 'string', $lte: normalizedNow },
      })
      .sort({ dueAt: 1, id: 1 })
      .limit(safeLimit)
      .toArray();

    const candidates = overdueMilestoneDeadlineCandidates(milestones, normalizedNow).slice(0, safeLimit);
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
        fingerprint: { $regex: `^${MILESTONE_DEADLINE_FINGERPRINT_PREFIX}` },
      })
      .sort({ updatedAt: 1, id: 1 })
      .limit(safeLimit)
      .toArray();

    let resolved = 0;
    for (const alert of resolvable) {
      if (await this.resolveOne(alert, normalizedNow)) resolved += 1;
    }

    return {
      scannedMilestones: milestones.length,
      candidates: candidates.length,
      created,
      existing,
      reopened,
      resolved,
      skipped,
    };
  }
}
