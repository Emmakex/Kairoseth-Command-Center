import { randomUUID } from 'node:crypto';
import type { Collection, Db, Filter } from 'mongodb';

export type IntegrationSyncSchedule = {
  id: string;
  workspaceId: string;
  provider: string;
  kind: string;
  resourceId: string;
  enabled: boolean;
  intervalSeconds: number;
  nextRunAt: string;
  createdAt: string;
  updatedAt: string;
  lastEnqueuedAt?: string;
  claimToken?: string;
  claimedAt?: string;
  leaseExpiresAt?: string;
};

export type UpsertIntegrationSyncScheduleInput = {
  workspaceId: string;
  provider: string;
  kind: string;
  resourceId: string;
  enabled: boolean;
  intervalSeconds: number;
  nextRunAt?: string;
};

export type ClaimIntegrationSyncScheduleOptions = {
  provider?: string;
  kind?: string;
  now?: Date;
  leaseMs?: number;
};

export interface IntegrationSyncScheduleStore {
  ensureIndexes(): Promise<void>;
  get(workspaceId: string, provider: string, kind: string, resourceId: string): Promise<IntegrationSyncSchedule | null>;
  upsert(input: UpsertIntegrationSyncScheduleInput): Promise<IntegrationSyncSchedule>;
  claimDue(options?: ClaimIntegrationSyncScheduleOptions): Promise<IntegrationSyncSchedule | null>;
  completeClaim(scheduleId: string, claimToken: string, now?: Date): Promise<IntegrationSyncSchedule | null>;
  releaseClaim(scheduleId: string, claimToken: string, nextRunAt: string, now?: Date): Promise<boolean>;
  requeueExpired(options?: { now?: Date; limit?: number }): Promise<number>;
}

const MIN_INTERVAL_SECONDS = 5 * 60;
const MAX_INTERVAL_SECONDS = 24 * 60 * 60;

function iso(date: Date): string {
  return date.toISOString();
}

function validText(value: string, field: string, max = 300): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new Error(`integration_sync_schedule_${field}_invalid`);
  return normalized;
}

function validIso(value: string, field: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`integration_sync_schedule_${field}_invalid`);
  return value;
}

export function normalizeIntegrationScheduleIntervalSeconds(value: number): number {
  if (!Number.isFinite(value)) throw new Error('integration_sync_schedule_interval_invalid');
  const normalized = Math.floor(value);
  if (normalized < MIN_INTERVAL_SECONDS || normalized > MAX_INTERVAL_SECONDS) {
    throw new Error('integration_sync_schedule_interval_invalid');
  }
  return normalized;
}

export function nextIntegrationScheduleAt(now: Date, intervalSeconds: number): string {
  const interval = normalizeIntegrationScheduleIntervalSeconds(intervalSeconds);
  return iso(new Date(now.getTime() + interval * 1000));
}

export class MongoIntegrationSyncScheduleStore implements IntegrationSyncScheduleStore {
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
      this.schedules.createIndex({ enabled: 1, provider: 1, kind: 1, nextRunAt: 1 }),
      this.schedules.createIndex({ enabled: 1, leaseExpiresAt: 1 }),
    ]);
  }

  async get(
    workspaceId: string,
    provider: string,
    kind: string,
    resourceId: string,
  ): Promise<IntegrationSyncSchedule | null> {
    return this.schedules.findOne({
      workspaceId: validText(workspaceId, 'workspace_id', 200),
      provider: validText(provider, 'provider', 100),
      kind: validText(kind, 'kind', 100),
      resourceId: validText(resourceId, 'resource_id', 200),
    });
  }

  async upsert(input: UpsertIntegrationSyncScheduleInput): Promise<IntegrationSyncSchedule> {
    const workspaceId = validText(input.workspaceId, 'workspace_id', 200);
    const provider = validText(input.provider, 'provider', 100);
    const kind = validText(input.kind, 'kind', 100);
    const resourceId = validText(input.resourceId, 'resource_id', 200);
    const intervalSeconds = normalizeIntegrationScheduleIntervalSeconds(input.intervalSeconds);
    const now = new Date();
    const identity = { workspaceId, provider, kind, resourceId };
    const existing = await this.schedules.findOne(identity);

    if (!existing) {
      const nextRunAt = validIso(
        input.nextRunAt ?? nextIntegrationScheduleAt(now, intervalSeconds),
        'next_run_at',
      );
      const schedule: IntegrationSyncSchedule = {
        id: randomUUID(),
        ...identity,
        enabled: input.enabled,
        intervalSeconds,
        nextRunAt,
        createdAt: iso(now),
        updatedAt: iso(now),
      };
      await this.schedules.insertOne(schedule);
      return schedule;
    }

    const nextRunAt = input.nextRunAt
      ? validIso(input.nextRunAt, 'next_run_at')
      : existing.nextRunAt;
    const updated = await this.schedules.findOneAndUpdate(
      { id: existing.id, workspaceId },
      {
        $set: {
          enabled: input.enabled,
          intervalSeconds,
          nextRunAt,
          updatedAt: iso(now),
        },
      },
      { returnDocument: 'after' },
    );
    if (!updated) throw new Error('integration_sync_schedule_update_failed');
    return updated;
  }

  async claimDue(options: ClaimIntegrationSyncScheduleOptions = {}): Promise<IntegrationSyncSchedule | null> {
    const now = options.now ?? new Date();
    const leaseMs = Math.min(30 * 60_000, Math.max(10_000, Math.floor(options.leaseMs ?? 120_000)));
    const claimToken = randomUUID();
    const filter: Filter<IntegrationSyncSchedule> = {
      enabled: true,
      nextRunAt: { $lte: iso(now) },
      $or: [
        { leaseExpiresAt: { $exists: false } },
        { leaseExpiresAt: { $lte: iso(now) } },
      ],
    };
    if (options.provider) filter.provider = validText(options.provider, 'provider', 100);
    if (options.kind) filter.kind = validText(options.kind, 'kind', 100);

    return this.schedules.findOneAndUpdate(
      filter,
      {
        $set: {
          claimToken,
          claimedAt: iso(now),
          leaseExpiresAt: iso(new Date(now.getTime() + leaseMs)),
          updatedAt: iso(now),
        },
      },
      { sort: { nextRunAt: 1, updatedAt: 1 }, returnDocument: 'after' },
    );
  }

  async completeClaim(
    scheduleId: string,
    claimToken: string,
    now = new Date(),
  ): Promise<IntegrationSyncSchedule | null> {
    const current = await this.schedules.findOne({ id: scheduleId, enabled: true, claimToken });
    if (!current) return null;
    return this.schedules.findOneAndUpdate(
      { id: scheduleId, enabled: true, claimToken },
      {
        $set: {
          lastEnqueuedAt: iso(now),
          nextRunAt: nextIntegrationScheduleAt(now, current.intervalSeconds),
          updatedAt: iso(now),
        },
        $unset: { claimToken: '', claimedAt: '', leaseExpiresAt: '' },
      },
      { returnDocument: 'after' },
    );
  }

  async releaseClaim(
    scheduleId: string,
    claimToken: string,
    nextRunAt: string,
    now = new Date(),
  ): Promise<boolean> {
    const result = await this.schedules.updateOne(
      { id: scheduleId, claimToken },
      {
        $set: {
          nextRunAt: validIso(nextRunAt, 'next_run_at'),
          updatedAt: iso(now),
        },
        $unset: { claimToken: '', claimedAt: '', leaseExpiresAt: '' },
      },
    );
    return result.modifiedCount === 1;
  }

  async requeueExpired(options: { now?: Date; limit?: number } = {}): Promise<number> {
    const now = options.now ?? new Date();
    const limit = Math.min(500, Math.max(1, Math.floor(options.limit ?? 100)));
    const expired = await this.schedules
      .find({ enabled: true, leaseExpiresAt: { $lte: iso(now) } })
      .sort({ leaseExpiresAt: 1 })
      .limit(limit)
      .project<{ id: string }>({ id: 1 })
      .toArray();
    if (expired.length === 0) return 0;

    const result = await this.schedules.updateMany(
      { id: { $in: expired.map((schedule) => schedule.id) }, enabled: true },
      {
        $set: { updatedAt: iso(now) },
        $unset: { claimToken: '', claimedAt: '', leaseExpiresAt: '' },
      },
    );
    return result.modifiedCount;
  }
}
