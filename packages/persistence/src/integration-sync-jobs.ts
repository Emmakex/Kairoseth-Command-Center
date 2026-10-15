import { randomUUID } from 'node:crypto';
import type { Collection, Db, Filter } from 'mongodb';

export type IntegrationSyncJobStatus = 'pending' | 'processing' | 'retry' | 'completed' | 'dead';

export type IntegrationSyncJob = {
  id: string;
  workspaceId: string;
  provider: string;
  kind: string;
  resourceId: string;
  dedupeKey: string;
  activeDedupeKey?: string;
  status: IntegrationSyncJobStatus;
  attempt: number;
  maxAttempts: number;
  availableAt: string;
  createdAt: string;
  updatedAt: string;
  claimedAt?: string;
  leaseExpiresAt?: string;
  claimToken?: string;
  completedAt?: string;
  lastErrorCode?: string;
};

export type EnqueueIntegrationSyncJobInput = {
  workspaceId: string;
  provider: string;
  kind: string;
  resourceId: string;
  dedupeKey: string;
  availableAt?: string;
  maxAttempts?: number;
};

export type ClaimIntegrationSyncJobOptions = {
  now?: Date;
  leaseMs?: number;
  provider?: string;
  kind?: string;
};

export type RetryIntegrationSyncJobInput = {
  jobId: string;
  claimToken: string;
  errorCode: string;
  now?: Date;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

export interface IntegrationSyncJobStore {
  ensureIndexes(): Promise<void>;
  enqueue(input: EnqueueIntegrationSyncJobInput): Promise<IntegrationSyncJob>;
  claimDue(options?: ClaimIntegrationSyncJobOptions): Promise<IntegrationSyncJob | null>;
  complete(jobId: string, claimToken: string, now?: Date): Promise<boolean>;
  fail(jobId: string, claimToken: string, errorCode: string, now?: Date): Promise<boolean>;
  retry(input: RetryIntegrationSyncJobInput): Promise<IntegrationSyncJob | null>;
  requeueExpired(options?: { now?: Date; limit?: number }): Promise<number>;
}

function iso(date: Date): string {
  return date.toISOString();
}

function validText(value: string, field: string, max = 300): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new Error(`integration_sync_job_${field}_invalid`);
  return normalized;
}

function validDate(value: string, field: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`integration_sync_job_${field}_invalid`);
  return value;
}

export function integrationSyncRetryDelayMs(
  attempt: number,
  baseDelayMs = 30_000,
  maxDelayMs = 3_600_000,
): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const base = Math.max(1_000, Math.floor(baseDelayMs));
  const cap = Math.max(base, Math.floor(maxDelayMs));
  return Math.min(cap, base * 2 ** Math.min(20, safeAttempt - 1));
}

export class MongoIntegrationSyncJobStore implements IntegrationSyncJobStore {
  private readonly jobs: Collection<IntegrationSyncJob>;

  constructor(db: Db) {
    this.jobs = db.collection<IntegrationSyncJob>('integration_sync_jobs');
  }

  private async ensureActiveDedupeIndex(): Promise<void> {
    const indexes = await this.jobs.listIndexes().toArray();
    const existing = indexes.find(
      (index) => index.key?.workspaceId === 1 && index.key?.activeDedupeKey === 1,
    );
    const partial = existing?.partialFilterExpression as
      | { activeDedupeKey?: { $type?: string } }
      | undefined;

    if (
      existing?.unique === true &&
      existing.sparse !== true &&
      partial?.activeDedupeKey?.$type === 'string'
    ) {
      return;
    }

    if (existing?.name) await this.jobs.dropIndex(existing.name);

    await this.jobs.createIndex(
      { workspaceId: 1, activeDedupeKey: 1 },
      {
        unique: true,
        partialFilterExpression: { activeDedupeKey: { $type: 'string' } },
      },
    );
  }

  async ensureIndexes(): Promise<void> {
    // Create the collection before inspecting/migrating the legacy sparse dedupe index.
    await this.jobs.createIndex({ id: 1 }, { unique: true });
    await this.ensureActiveDedupeIndex();
    await Promise.all([
      this.jobs.createIndex({ status: 1, provider: 1, kind: 1, availableAt: 1, createdAt: 1 }),
      this.jobs.createIndex({ status: 1, leaseExpiresAt: 1 }),
      this.jobs.createIndex({ workspaceId: 1, resourceId: 1, updatedAt: -1 }),
    ]);
  }

  async enqueue(input: EnqueueIntegrationSyncJobInput): Promise<IntegrationSyncJob> {
    const workspaceId = validText(input.workspaceId, 'workspace_id', 200);
    const provider = validText(input.provider, 'provider', 100);
    const kind = validText(input.kind, 'kind', 100);
    const resourceId = validText(input.resourceId, 'resource_id', 200);
    const dedupeKey = validText(input.dedupeKey, 'dedupe_key', 500);
    const now = new Date();
    const availableAt = validDate(input.availableAt ?? iso(now), 'available_at');
    const maxAttempts = Math.min(20, Math.max(1, Math.floor(input.maxAttempts ?? 8)));

    const existing = await this.jobs.findOne({ workspaceId, activeDedupeKey: dedupeKey });
    if (existing) return existing;

    const job: IntegrationSyncJob = {
      id: randomUUID(),
      workspaceId,
      provider,
      kind,
      resourceId,
      dedupeKey,
      activeDedupeKey: dedupeKey,
      status: 'pending',
      attempt: 0,
      maxAttempts,
      availableAt,
      createdAt: iso(now),
      updatedAt: iso(now),
    };

    try {
      await this.jobs.insertOne(job);
      return job;
    } catch (error) {
      const raced = await this.jobs.findOne({ workspaceId, activeDedupeKey: dedupeKey });
      if (raced) return raced;
      throw error;
    }
  }

  async claimDue(options: ClaimIntegrationSyncJobOptions = {}): Promise<IntegrationSyncJob | null> {
    const now = options.now ?? new Date();
    const leaseMs = Math.min(30 * 60_000, Math.max(10_000, Math.floor(options.leaseMs ?? 120_000)));
    const claimToken = randomUUID();
    const filter: Filter<IntegrationSyncJob> = {
      status: { $in: ['pending', 'retry'] },
      availableAt: { $lte: iso(now) },
    };
    if (options.provider) filter.provider = validText(options.provider, 'provider', 100);
    if (options.kind) filter.kind = validText(options.kind, 'kind', 100);

    return this.jobs.findOneAndUpdate(
      filter,
      {
        $set: {
          status: 'processing',
          claimedAt: iso(now),
          leaseExpiresAt: iso(new Date(now.getTime() + leaseMs)),
          claimToken,
          updatedAt: iso(now),
        },
        $inc: { attempt: 1 },
        $unset: { completedAt: '' },
      },
      { sort: { availableAt: 1, createdAt: 1 }, returnDocument: 'after' },
    );
  }

  async complete(jobId: string, claimToken: string, now = new Date()): Promise<boolean> {
    const result = await this.jobs.updateOne(
      { id: jobId, status: 'processing', claimToken },
      {
        $set: { status: 'completed', completedAt: iso(now), updatedAt: iso(now) },
        $unset: {
          activeDedupeKey: '',
          claimToken: '',
          claimedAt: '',
          leaseExpiresAt: '',
          lastErrorCode: '',
        },
      },
    );
    return result.modifiedCount === 1;
  }

  async fail(jobId: string, claimToken: string, errorCode: string, now = new Date()): Promise<boolean> {
    const normalizedErrorCode = validText(errorCode, 'error_code', 200);
    const result = await this.jobs.updateOne(
      { id: jobId, status: 'processing', claimToken },
      {
        $set: { status: 'dead', lastErrorCode: normalizedErrorCode, updatedAt: iso(now) },
        $unset: {
          activeDedupeKey: '',
          claimToken: '',
          claimedAt: '',
          leaseExpiresAt: '',
        },
      },
    );
    return result.modifiedCount === 1;
  }

  async retry(input: RetryIntegrationSyncJobInput): Promise<IntegrationSyncJob | null> {
    const now = input.now ?? new Date();
    const current = await this.jobs.findOne({
      id: input.jobId,
      status: 'processing',
      claimToken: input.claimToken,
    });
    if (!current) return null;

    const errorCode = validText(input.errorCode, 'error_code', 200);
    const terminal = current.attempt >= current.maxAttempts;
    const delay = integrationSyncRetryDelayMs(current.attempt, input.baseDelayMs, input.maxDelayMs);
    return this.jobs.findOneAndUpdate(
      { id: current.id, status: 'processing', claimToken: input.claimToken },
      {
        $set: {
          status: terminal ? 'dead' : 'retry',
          lastErrorCode: errorCode,
          availableAt: terminal ? current.availableAt : iso(new Date(now.getTime() + delay)),
          updatedAt: iso(now),
        },
        $unset: {
          ...(terminal ? { activeDedupeKey: '' } : {}),
          claimToken: '',
          claimedAt: '',
          leaseExpiresAt: '',
        },
      },
      { returnDocument: 'after' },
    );
  }

  async requeueExpired(options: { now?: Date; limit?: number } = {}): Promise<number> {
    const now = options.now ?? new Date();
    const limit = Math.min(500, Math.max(1, Math.floor(options.limit ?? 100)));
    const expired = await this.jobs
      .find({ status: 'processing', leaseExpiresAt: { $lte: iso(now) } })
      .sort({ leaseExpiresAt: 1 })
      .limit(limit)
      .project<{ id: string }>({ id: 1 })
      .toArray();
    if (expired.length === 0) return 0;

    const result = await this.jobs.updateMany(
      { id: { $in: expired.map((job) => job.id) }, status: 'processing' },
      {
        $set: {
          status: 'retry',
          availableAt: iso(now),
          updatedAt: iso(now),
          lastErrorCode: 'lease_expired',
        },
        $unset: { claimToken: '', claimedAt: '', leaseExpiresAt: '' },
      },
    );
    return result.modifiedCount;
  }
}
