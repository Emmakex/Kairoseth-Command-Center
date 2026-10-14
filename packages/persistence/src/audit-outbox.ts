import { randomUUID } from 'node:crypto';
import type { ClientSession, Collection, Db } from 'mongodb';
import type { Scope, TimelineEvent } from '@kcc/domain';

export type AuditEventInput = {
  scope: Scope;
  type: string;
  entityType: string;
  entityId: string;
  summary: string;
  source: string;
  actorUserId?: string;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
};

export type AuditOutboxStatus = 'pending' | 'processing' | 'delivered' | 'failed';

export type AuditOutboxRecord = {
  id: string;
  event: TimelineEvent;
  status: AuditOutboxStatus;
  attempts: number;
  availableAt: string;
  createdAt: string;
  updatedAt: string;
  lockedAt?: string;
  deliveredAt?: string;
  lastError?: string;
};

export type AuditDrainResult = {
  claimed: number;
  delivered: number;
  failed: number;
};

function buildTimelineEvent(input: AuditEventInput): TimelineEvent {
  return {
    id: randomUUID(),
    scope: input.scope,
    type: input.type,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    source: input.source,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    metadata: input.metadata ?? {},
    ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
  };
}

function retryAt(attempts: number): string {
  const delayMs = Math.min(300_000, Math.max(5_000, attempts * 15_000));
  return new Date(Date.now() + delayMs).toISOString();
}

export class MongoAuditOutboxStore {
  private readonly outbox: Collection<AuditOutboxRecord>;
  private readonly timeline: Collection<TimelineEvent>;

  constructor(db: Db) {
    this.outbox = db.collection<AuditOutboxRecord>('audit_outbox');
    this.timeline = db.collection<TimelineEvent>('timeline_events');
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.outbox.createIndex({ status: 1, availableAt: 1, createdAt: 1 }),
      this.outbox.createIndex({ lockedAt: 1 }, { sparse: true }),
      this.timeline.createIndex({ id: 1 }, { unique: true }),
    ]);
  }

  async enqueue(input: AuditEventInput, session?: ClientSession): Promise<TimelineEvent> {
    const event = buildTimelineEvent(input);
    const now = new Date().toISOString();
    const record: AuditOutboxRecord = {
      id: randomUUID(),
      event,
      status: 'pending',
      attempts: 0,
      availableAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await this.outbox.insertOne(record, session ? { session } : undefined);
    return event;
  }

  async enqueueMany(inputs: AuditEventInput[], session?: ClientSession): Promise<TimelineEvent[]> {
    if (inputs.length === 0) return [];
    const now = new Date().toISOString();
    const events = inputs.map(buildTimelineEvent);
    const records: AuditOutboxRecord[] = events.map((event) => ({
      id: randomUUID(),
      event,
      status: 'pending',
      attempts: 0,
      availableAt: now,
      createdAt: now,
      updatedAt: now,
    }));
    await this.outbox.insertMany(records, session ? { session } : undefined);
    return events;
  }

  async recoverStaleLeases(leaseMs = 300_000): Promise<number> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - leaseMs).toISOString();
    const nowIso = now.toISOString();
    const result = await this.outbox.updateMany(
      { status: 'processing', lockedAt: { $lte: staleBefore } },
      {
        $set: { status: 'pending', availableAt: nowIso, updatedAt: nowIso },
        $unset: { lockedAt: '' },
      },
    );
    return result.modifiedCount;
  }

  async drainPending(limit = 50, maxAttempts = 10): Promise<AuditDrainResult> {
    await this.recoverStaleLeases();
    const result: AuditDrainResult = { claimed: 0, delivered: 0, failed: 0 };

    for (let index = 0; index < limit; index += 1) {
      const now = new Date().toISOString();
      const record = await this.outbox.findOneAndUpdate(
        { status: 'pending', availableAt: { $lte: now } },
        {
          $set: { status: 'processing', lockedAt: now, updatedAt: now },
          $inc: { attempts: 1 },
        },
        { sort: { createdAt: 1 }, returnDocument: 'after' },
      );
      if (!record) break;
      result.claimed += 1;

      try {
        await this.timeline.updateOne(
          { id: record.event.id },
          { $setOnInsert: record.event },
          { upsert: true },
        );
        const deliveredAt = new Date().toISOString();
        await this.outbox.updateOne(
          { id: record.id, status: 'processing' },
          {
            $set: { status: 'delivered', deliveredAt, updatedAt: deliveredAt },
            $unset: { lockedAt: '', lastError: '' },
          },
        );
        result.delivered += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 1000) : 'unknown_error';
        const terminal = record.attempts >= maxAttempts;
        const updatedAt = new Date().toISOString();
        await this.outbox.updateOne(
          { id: record.id, status: 'processing' },
          {
            $set: {
              status: terminal ? 'failed' : 'pending',
              availableAt: terminal ? record.availableAt : retryAt(record.attempts),
              updatedAt,
              lastError: message,
            },
            $unset: { lockedAt: '' },
          },
        );
        result.failed += 1;
      }
    }

    return result;
  }
}
