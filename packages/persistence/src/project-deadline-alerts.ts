import { randomUUID } from 'node:crypto';
import { MongoServerError, type ClientSession, type Collection, type Db, type MongoClient } from 'mongodb';
import type { Alert, Project, Scope } from '@kcc/domain';
import { MongoAuditOutboxStore } from './audit-outbox.js';

const PROJECT_DEADLINE_FINGERPRINT_PREFIX = 'project-deadline:';

type DeadlineScope = Extract<Scope, { kind: 'workspace' | 'private' }>;

export type ProjectDeadlineCandidate = {
  projectId: string;
  scope: DeadlineScope;
  dueAt: string;
};

export type ProjectDeadlineReconciliationResult = {
  scannedProjects: number;
  candidates: number;
  created: number;
  existing: number;
  reopened: number;
  resolved: number;
  skipped: number;
};

type MaterializeResult = 'created' | 'existing' | 'reopened' | 'skipped';

type ResolutionReason =
  | 'project_missing'
  | 'project_done'
  | 'project_archived'
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

export function projectDeadlineFingerprint(projectId: string): string {
  return `${PROJECT_DEADLINE_FINGERPRINT_PREFIX}${projectId}`;
}

function projectIdFromDeadlineFingerprint(fingerprint: string | undefined): string | null {
  if (!fingerprint?.startsWith(PROJECT_DEADLINE_FINGERPRINT_PREFIX)) return null;
  const projectId = fingerprint.slice(PROJECT_DEADLINE_FINGERPRINT_PREFIX.length).trim();
  return projectId || null;
}

export function isProjectOverdue(project: Project, now: string): boolean {
  if (!isDeadlineScope(project.scope)) return false;
  if (project.status === 'done' || project.status === 'archived') return false;
  const nowMs = Date.parse(now);
  const dueAtMs = project.dueAt ? Date.parse(project.dueAt) : Number.NaN;
  return Number.isFinite(nowMs) && Number.isFinite(dueAtMs) && dueAtMs <= nowMs;
}

export function overdueProjectDeadlineCandidates(
  projects: Project[],
  now: string,
): ProjectDeadlineCandidate[] {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error('project_deadline_reconciliation_now_invalid');

  return projects
    .filter((project) => isProjectOverdue(project, now) && isDeadlineScope(project.scope))
    .map((project) => ({
      projectId: project.id,
      scope: project.scope as DeadlineScope,
      dueAt: project.dueAt!,
    }))
    .sort((left, right) => {
      const due = left.dueAt.localeCompare(right.dueAt);
      return due !== 0 ? due : left.projectId.localeCompare(right.projectId);
    });
}

function resolutionReason(project: Project | null, now: string): ResolutionReason | null {
  if (!project) return 'project_missing';
  if (project.status === 'done') return 'project_done';
  if (project.status === 'archived') return 'project_archived';
  if (!project.dueAt || !Number.isFinite(Date.parse(project.dueAt))) return 'deadline_missing_or_invalid';
  return isProjectOverdue(project, now) ? null : 'deadline_not_overdue';
}

export class MongoProjectDeadlineAlertStore {
  private readonly projects: Collection<Project>;
  private readonly alerts: Collection<Alert>;
  private readonly outbox: MongoAuditOutboxStore;

  constructor(
    private readonly client: MongoClient,
    db: Db,
  ) {
    this.projects = db.collection<Project>('projects');
    this.alerts = db.collection<Alert>('alerts');
    this.outbox = new MongoAuditOutboxStore(db);
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.projects.createIndex({ 'scope.kind': 1, status: 1, dueAt: 1 }),
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

  private async materializeOne(candidate: ProjectDeadlineCandidate, now: string): Promise<MaterializeResult> {
    const scoped = scopeFilter(candidate.scope);
    const fingerprint = projectDeadlineFingerprint(candidate.projectId);
    const alertFilter = { ...scoped, fingerprint };

    try {
      return await this.transaction<MaterializeResult>(async (session) => {
        const project = await this.projects.findOne({ ...scoped, id: candidate.projectId }, { session });
        if (!project || !isProjectOverdue(project, now) || !project.dueAt) return 'skipped';

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
                title: project.name,
                severity: 'urgent',
                projectId: project.id,
                updatedAt: changedAt,
              },
              $unset: { acknowledgedAt: '', resolvedAt: '' },
            },
            { session },
          );
          if (update.matchedCount === 0) return 'existing';

          const reopened = await this.alerts.findOne(alertFilter, { session });
          if (!reopened) throw new Error('project_deadline_alert_reopen_failed');
          await this.outbox.enqueue(
            {
              scope: candidate.scope,
              type: 'alert.reopened',
              entityType: 'alert',
              entityId: reopened.id,
              summary: reopened.title,
              source: 'project-deadlines',
              metadata: {
                projectId: project.id,
                dueAt: project.dueAt,
                cause: 'project_deadline_overdue',
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
          projectId: project.id,
          title: project.name,
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
        if (!stored) throw new Error('project_deadline_alert_materialization_failed');
        if (upsert.upsertedCount === 0) return 'existing';

        await this.outbox.enqueue(
          {
            scope: candidate.scope,
            type: 'alert.project_deadline_overdue',
            entityType: 'alert',
            entityId: stored.id,
            summary: stored.title,
            source: 'project-deadlines',
            metadata: {
              projectId: project.id,
              dueAt: project.dueAt,
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
    const projectId = projectIdFromDeadlineFingerprint(fingerprint);
    if (!projectId) return false;

    const scoped = scopeFilter(alert.scope);
    return this.transaction(async (session) => {
      const project = await this.projects.findOne({ ...scoped, id: projectId }, { session });
      const reason = resolutionReason(project, now);
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
          source: 'project-deadlines',
          metadata: {
            projectId,
            reason,
            ...(project?.dueAt ? { dueAt: project.dueAt } : {}),
          },
        },
        session,
      );
      return true;
    });
  }

  async reconcile(now: string, limit = 100): Promise<ProjectDeadlineReconciliationResult> {
    const nowMs = Date.parse(now);
    if (!Number.isFinite(nowMs)) throw new Error('project_deadline_reconciliation_now_invalid');
    const normalizedNow = new Date(nowMs).toISOString();
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));

    const projects = await this.projects
      .find({
        'scope.kind': { $in: ['workspace', 'private'] },
        status: { $nin: ['done', 'archived'] },
        dueAt: { $type: 'string', $lte: normalizedNow },
      })
      .sort({ dueAt: 1, id: 1 })
      .limit(safeLimit)
      .toArray();

    const candidates = overdueProjectDeadlineCandidates(projects, normalizedNow).slice(0, safeLimit);
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
        fingerprint: { $regex: `^${PROJECT_DEADLINE_FINGERPRINT_PREFIX}` },
      })
      .sort({ updatedAt: 1, id: 1 })
      .limit(safeLimit)
      .toArray();

    let resolved = 0;
    for (const alert of resolvable) {
      if (await this.resolveOne(alert, normalizedNow)) resolved += 1;
    }

    return {
      scannedProjects: projects.length,
      candidates: candidates.length,
      created,
      existing,
      reopened,
      resolved,
      skipped,
    };
  }
}
