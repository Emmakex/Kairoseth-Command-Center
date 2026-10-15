import { randomUUID } from 'node:crypto';
import { MongoServerError, type ClientSession, type Collection, type Db, type MongoClient } from 'mongodb';
import type { Alert, Scope } from '@kcc/domain';
import type {
  DerivedSignalAlert,
  DerivedSignalAlertResolution,
} from '@kcc/integrations/signal-alert-rules';
import { MongoAuditOutboxStore } from './audit-outbox.js';

type WorkspaceScope = Extract<Scope, { kind: 'workspace' }>;

export type MaterializeSignalAlertResult = {
  status: 'created' | 'existing' | 'reopened' | 'updated';
  alert: Alert;
};

function canReopen(existing: Alert, candidate: DerivedSignalAlert): boolean {
  if (existing.status !== 'resolved' || !existing.resolvedAt) return false;
  const resolvedAt = Date.parse(existing.resolvedAt);
  const occurredAt = Date.parse(candidate.occurredAt);
  return Number.isFinite(resolvedAt) && Number.isFinite(occurredAt) && occurredAt > resolvedAt;
}

function canApplyPolicyUpdate(existing: Alert, candidate: DerivedSignalAlert): boolean {
  return (
    (existing.status === 'open' || existing.status === 'acknowledged') &&
    existing.severity !== candidate.severity
  );
}

export class MongoIntegrationSignalAlertStore {
  private readonly alerts: Collection<Alert>;
  private readonly outbox: MongoAuditOutboxStore;

  constructor(
    private readonly client: MongoClient,
    db: Db,
  ) {
    this.alerts = db.collection<Alert>('alerts');
    this.outbox = new MongoAuditOutboxStore(db);
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
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

  async materialize(workspaceId: string, candidate: DerivedSignalAlert): Promise<MaterializeSignalAlertResult> {
    const scope: WorkspaceScope = { kind: 'workspace', workspaceId };
    const filter = {
      'scope.kind': 'workspace' as const,
      'scope.workspaceId': workspaceId,
      fingerprint: candidate.fingerprint,
    };

    const existing = await this.alerts.findOne(filter);
    if (existing) {
      if (canReopen(existing, candidate)) {
        return this.transaction(async (session) => {
          const now = new Date().toISOString();
          const update = await this.alerts.updateOne(
            { ...filter, status: 'resolved', updatedAt: existing.updatedAt },
            {
              $set: {
                status: 'open',
                title: candidate.title,
                severity: candidate.severity,
                updatedAt: now,
              },
              $unset: { acknowledgedAt: '', resolvedAt: '' },
            },
            { session },
          );
          if (update.matchedCount === 0) {
            const current = await this.alerts.findOne(filter, { session });
            if (!current) throw new Error('integration_signal_alert_reopen_lost');
            return { status: 'existing', alert: current };
          }

          const reopened = await this.alerts.findOne(filter, { session });
          if (!reopened) throw new Error('integration_signal_alert_reopen_failed');
          await this.outbox.enqueue(
            {
              scope,
              type: 'alert.reopened',
              entityType: 'alert',
              entityId: reopened.id,
              summary: reopened.title,
              source: 'integration-rules',
              metadata: {
                ruleId: candidate.ruleId,
                signalId: candidate.signalId,
                signalType: candidate.signalType,
                severity: candidate.severity,
                occurredAt: candidate.occurredAt,
              },
            },
            session,
          );
          return { status: 'reopened', alert: reopened };
        });
      }

      if (canApplyPolicyUpdate(existing, candidate)) {
        return this.transaction(async (session) => {
          const now = new Date().toISOString();
          const update = await this.alerts.updateOne(
            { ...filter, status: existing.status, updatedAt: existing.updatedAt },
            { $set: { severity: candidate.severity, updatedAt: now } },
            { session },
          );
          if (update.matchedCount === 0) {
            const current = await this.alerts.findOne(filter, { session });
            if (!current) throw new Error('integration_signal_alert_policy_update_lost');
            return { status: 'existing', alert: current };
          }
          const updated = await this.alerts.findOne(filter, { session });
          if (!updated) throw new Error('integration_signal_alert_policy_update_failed');
          await this.outbox.enqueue(
            {
              scope,
              type: 'alert.policy_updated',
              entityType: 'alert',
              entityId: updated.id,
              summary: updated.title,
              source: 'automation-rules',
              metadata: {
                ruleId: candidate.ruleId,
                signalId: candidate.signalId,
                signalType: candidate.signalType,
                previousSeverity: existing.severity,
                severity: candidate.severity,
                occurredAt: candidate.occurredAt,
              },
            },
            session,
          );
          return { status: 'updated', alert: updated };
        });
      }

      return { status: 'existing', alert: existing };
    }

    const now = new Date().toISOString();
    const alert: Alert = {
      id: randomUUID(),
      scope,
      title: candidate.title,
      severity: candidate.severity,
      status: 'open',
      fingerprint: candidate.fingerprint,
      createdAt: now,
      updatedAt: now,
      ...(candidate.message ? { message: candidate.message } : {}),
      ...(candidate.projectId ? { projectId: candidate.projectId } : {}),
    };

    try {
      return await this.transaction(async (session) => {
        const result = await this.alerts.updateOne(
          filter,
          { $setOnInsert: alert },
          { upsert: true, session },
        );
        const stored = await this.alerts.findOne(filter, { session });
        if (!stored) throw new Error('integration_signal_alert_materialization_failed');
        if (result.upsertedCount === 0) return { status: 'existing', alert: stored };

        await this.outbox.enqueue(
          {
            scope,
            type: 'alert.derived',
            entityType: 'alert',
            entityId: stored.id,
            summary: stored.title,
            source: 'integration-rules',
            metadata: {
              ruleId: candidate.ruleId,
              signalId: candidate.signalId,
              signalType: candidate.signalType,
              severity: candidate.severity,
              occurredAt: candidate.occurredAt,
            },
          },
          session,
        );
        return { status: 'created', alert: stored };
      });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const concurrentExisting = await this.alerts.findOne(filter);
        if (concurrentExisting) return { status: 'existing', alert: concurrentExisting };
      }
      throw error;
    }
  }

  async resolve(
    workspaceId: string,
    resolutions: DerivedSignalAlertResolution[],
  ): Promise<number> {
    if (resolutions.length === 0) return 0;
    const scope: WorkspaceScope = { kind: 'workspace', workspaceId };
    const byFingerprint = new Map(resolutions.map((resolution) => [resolution.fingerprint, resolution]));

    return this.transaction(async (session) => {
      const candidates = await this.alerts
        .find(
          {
            'scope.kind': 'workspace',
            'scope.workspaceId': workspaceId,
            fingerprint: { $in: [...byFingerprint.keys()] },
            status: { $in: ['open', 'acknowledged'] },
          },
          { session },
        )
        .toArray();
      if (candidates.length === 0) return 0;

      let resolved = 0;
      for (const alert of candidates) {
        if (!alert.fingerprint) continue;
        const resolution = byFingerprint.get(alert.fingerprint);
        if (!resolution) continue;
        const now = new Date().toISOString();
        const update = await this.alerts.updateOne(
          {
            id: alert.id,
            'scope.kind': 'workspace',
            'scope.workspaceId': workspaceId,
            status: alert.status,
            updatedAt: alert.updatedAt,
          },
          {
            $set: {
              status: 'resolved',
              resolvedAt: resolution.occurredAt,
              updatedAt: now,
            },
          },
          { session },
        );
        if (update.matchedCount === 0) continue;

        await this.outbox.enqueue(
          {
            scope,
            type: 'alert.auto_resolved',
            entityType: 'alert',
            entityId: alert.id,
            summary: `${alert.title}: resolved`,
            source: 'integration-rules',
            metadata: {
              ruleId: resolution.ruleId,
              causeSignalId: resolution.causeSignalId,
              signalType: resolution.signalType,
              occurredAt: resolution.occurredAt,
            },
          },
          session,
        );
        resolved += 1;
      }
      return resolved;
    });
  }
}
