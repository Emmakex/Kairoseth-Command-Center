import { randomUUID } from 'node:crypto';
import { MongoServerError, type ClientSession, type Collection, type Db, type MongoClient } from 'mongodb';
import type { Alert, Scope } from '@kcc/domain';
import type { DerivedSignalAlert } from '@kcc/integrations/signal-alert-rules';
import { MongoAuditOutboxStore } from './audit-outbox.js';

type WorkspaceScope = Extract<Scope, { kind: 'workspace' }>;

export type MaterializeSignalAlertResult = {
  status: 'created' | 'existing';
  alert: Alert;
};

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
        const existing = await this.alerts.findOne(filter);
        if (existing) return { status: 'existing', alert: existing };
      }
      throw error;
    }
  }
}
