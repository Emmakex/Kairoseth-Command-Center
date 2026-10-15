import { randomUUID } from 'node:crypto';
import type { Collection, Db, Filter } from 'mongodb';

export type IntegrationSyncSchedule = {
  id: string;
  workspaceId: string;
  provider: string;
  kind: string;
  resourceId: string;
  intervalMs: number;
  nextRunAt: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  claimToken?: string;
  claimedAt?: string;
  leaseExpiresAt?: string;
};

export type EnsureIntegrationSyncScheduleInput = {
  workspaceId: string;
  provider: string;
  kind: string;
  resourceId: string;
  intervalMs: number;
  nextRunAt?: string;
};

function iso(date: Date): string {
  return date.toISOString();
}

function validText(value: string, field: string, max = 300): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new Error(`integration_sync_schedule_${field}_invalid`);
  return normalized;
}

function validDate(value: string, field: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`integration_sync_schedule_${field}_invalid`);
  return value;
}

function boundedInterval(value: number): number {
  if (!Number.isFinite(value)) throw new Error('integration_sync_schedule_interval_invalid');
  return Math.min(24 * 60 * 60_000, Math.max(60_000, Math.floor(value)));
}

export class MongoIntegrationSyncScheduleStore {
  private readonly schedules: Collection<IntegrationSyncSchedule>;

  constructor(db: Db) {
    this.schedules = db.collection<IntegrationSyncSchedule>('integration_sync_schedules');
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.schedules.createIndex({ id: 1 }, { unique: true }),
      this.schedules.createIndex(
        { workspaceId: 1, provider: 1, kind: 1, resourceId: 1 },
        { unique: true },
      ),
      this.schedules.createIndex({ enabled: 1, nextRunAt: 1 }),
      this.schedules.createIndex({ leaseExpiresAt: 1 }, { sparse: true }),
    ]);
  }

  async ensureRecurring(input: EnsureIntegrationSyncScheduleInput): Promise<IntegrationSyncSchedule> {
    const workspaceId = validText(input.workspaceId, 'workspace_id', 200);
    const provider = validText(input.provider, 'provider', 100);
    const kind = validText(input.kind, 'kind', 100);
    const resourceId = validText(input.resourceId, 'resource_id', 200);
    const intervalMs = boundedInterval(input.intervalMs);
    const now = new Date();
    const requestedNextRunAt = validDate(input.nextRunAt ?? iso(now), 'next_run_at');

    const existing = await this.schedules.findOne({ workspaceId, provider, kind, resourceId });
    if (existing) {
      const updated = await this.schedules.findOneAndUpdate(
        { id: existing.id },
        {
          $set: {
            intervalMs,
            enabled: true,
            updatedAt: iso(now),
          },
        },
        { returnDocument: 'after' },
      );
      if (!updated) throw new Error('integration_sync_schedule_update_failed');
      return updated;
    }

    const schedule: IntegrationSyncSchedule = {
      id: randomUUID(),
      workspaceId,
      provider,
      kind,
      resourceId,
      intervalMs,
      nextRunAt: requestedNextRunAt,
      enabled: true,
      createdAt: iso(now),
      updatedAt: iso(now),
    };
    try {
      await this.schedules.insertOne(schedule);
      return schedule;
    } catch (error) {
      const raced = await this.schedules.findOne({ workspaceId, provider, kind, resourceId });
      if (raced) return raced;
      throw error;
    }
  }

  async disableMissingResources(
    provider: string,
    kind: string,
    activeResourceKeys: string[],
  ): Promise<number> {
    const normalizedProvider = validText(provider, 'provider', 100);
    const normalizedKind = validText(kind, 'kind', 100);
    const filter: Filter<IntegrationSyncSchedule> = {
      provider: normalizedProvider,
      kind: normalizedKind,
      enabled: true,
    };
    if (activeResourceKeys.length > 0) {
      filter.$expr = {
        $not: {
          $in: [
            { $concat: ['$workspaceId', '|', '$resourceId'] },
            activeResourceKeys,
          ],
        },
      };
    }
    const result = await this.schedules.updateMany(filter, {
      $set: { enabled: false, updatedAt: iso(new Date()) },
      $unset: { claimToken: '', claimedAt: '', leaseExpiresAt: '' },
    });
    return result.modifiedCount;
  }

  async claimDue(options: { now?: Date; leaseMs?: number } = {}): Promise<IntegrationSyncSchedule | null> {
    const now = options.now ?? new Date();
    const leaseMs = Math.min(30 * 60_000, Math.max(10_000, Math.floor(options.leaseMs ?? 120_000)));
    const claimToken = randomUUID();
    return this.schedules.findOneAndUpdate(
      {
        enabled: true,
        nextRunAt: { $lte: iso(now) },
        claimToken: { $exists: false },
      },
      {
        $set: {
          claimToken,
          claimedAt: iso(now),
          leaseExpiresAt: iso(new Date(now.getTime() + leaseMs)),
          updatedAt: iso(now),
        },
      },
      { sort: { nextRunAt: 1, createdAt: 1 }, returnDocument: 'after' },
    );
  }

  async completeRun(scheduleId: string, claimToken: string, now = new Date()): Promise<boolean> {
    const schedule = await this.schedules.findOne({ id: scheduleId, claimToken, enabled: true });
    if (!schedule) return false;
    const nextRunAt = iso(new Date(now.getTime() + boundedInterval(schedule.intervalMs)));
    const result = await this.schedules.updateOne(
      { id: scheduleId, claimToken, enabled: true },
      {
        $set: { nextRunAt, updatedAt: iso(now) },
        $unset: { claimToken: '', claimedAt: '', leaseExpiresAt: '' },
      },
    );
    return result.modifiedCount === 1;
  }

  async releaseClaim(scheduleId: string, claimToken: string, delayMs = 60_000, now = new Date()): Promise<boolean> {
    const delay = Math.min(60 * 60_000, Math.max(10_000, Math.floor(delayMs)));
    const result = await this.schedules.updateOne(
      { id: scheduleId, claimToken, enabled: true },
      {
        $set: {
          nextRunAt: iso(new Date(now.getTime() + delay)),
          updatedAt: iso(now),
        },
        $unset: { claimToken: '', claimedAt: '', leaseExpiresAt: '' },
      },
    );
    return result.modifiedCount === 1;
  }

  async requeueExpired(now = new Date()): Promise<number> {
    const result = await this.schedules.updateMany(
      {
        enabled: true,
        leaseExpiresAt: { $lte: iso(now) },
      },
      {
        $set: { nextRunAt: iso(now), updatedAt: iso(now) },
        $unset: { claimToken: '', claimedAt: '', leaseExpiresAt: '' },
      },
    );
    return result.modifiedCount;
  }
}
