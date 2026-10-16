import { randomUUID } from 'node:crypto';
import type { ClientSession, Collection, Db, MongoClient } from 'mongodb';
import type { PrioritizationWeights, Scope } from '@kcc/domain';
import { defaultPrioritizationWeights } from '@kcc/domain';
import { MongoAuditOutboxStore } from './audit-outbox.js';

type WorkspaceScope = Extract<Scope, { kind: 'workspace' }>;

export type StoredPrioritizationWeightPolicy = {
  id: string;
  workspaceId: string;
  weights: Partial<PrioritizationWeights>;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type EffectivePrioritizationWeightPolicy = {
  weights: PrioritizationWeights;
  overridden: boolean;
  updatedAt?: string;
};

export interface PrioritizationWeightPolicyStore {
  ensureIndexes(): Promise<void>;
  getEffective(workspaceId: string): Promise<EffectivePrioritizationWeightPolicy>;
  upsert(input: {
    workspaceId: string;
    actorUserId: string;
    weights: PrioritizationWeights;
  }): Promise<StoredPrioritizationWeightPolicy & { weights: PrioritizationWeights }>;
}

const WEIGHT_KEYS = Object.keys(defaultPrioritizationWeights()) as (keyof PrioritizationWeights)[];

function validText(value: string, field: string, maxLength = 200): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`prioritization_weight_policy_${field}_invalid`);
  }
  return normalized;
}

export function validatePrioritizationWeights(weights: PrioritizationWeights): PrioritizationWeights {
  const validated = {} as PrioritizationWeights;
  for (const key of WEIGHT_KEYS) {
    const value = weights[key];
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      throw new Error(`prioritization_weight_policy_${key}_invalid`);
    }
    validated[key] = value;
  }
  return validated;
}

export function effectivePrioritizationWeights(
  stored?: Partial<PrioritizationWeights> | null,
): PrioritizationWeights {
  return validatePrioritizationWeights({
    ...defaultPrioritizationWeights(),
    ...(stored ?? {}),
  });
}

export class MongoPrioritizationWeightPolicyStore implements PrioritizationWeightPolicyStore {
  private readonly policies: Collection<StoredPrioritizationWeightPolicy>;
  private readonly outbox: MongoAuditOutboxStore;

  constructor(
    private readonly client: MongoClient,
    db: Db,
  ) {
    this.policies = db.collection<StoredPrioritizationWeightPolicy>('prioritization_weight_policies');
    this.outbox = new MongoAuditOutboxStore(db);
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.policies.createIndex({ id: 1 }, { unique: true }),
      this.policies.createIndex({ workspaceId: 1 }, { unique: true }),
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

  async getEffective(workspaceId: string): Promise<EffectivePrioritizationWeightPolicy> {
    const normalizedWorkspaceId = validText(workspaceId, 'workspace_id');
    const stored = await this.policies.findOne({ workspaceId: normalizedWorkspaceId });
    return stored
      ? {
          weights: effectivePrioritizationWeights(stored.weights),
          overridden: true,
          updatedAt: stored.updatedAt,
        }
      : { weights: defaultPrioritizationWeights(), overridden: false };
  }

  async upsert(input: {
    workspaceId: string;
    actorUserId: string;
    weights: PrioritizationWeights;
  }): Promise<StoredPrioritizationWeightPolicy & { weights: PrioritizationWeights }> {
    const workspaceId = validText(input.workspaceId, 'workspace_id');
    const actorUserId = validText(input.actorUserId, 'actor_user_id');
    const weights = validatePrioritizationWeights(input.weights);
    const scope: WorkspaceScope = { kind: 'workspace', workspaceId };

    return this.transaction(async (session) => {
      const existing = await this.policies.findOne({ workspaceId }, { session });
      const now = new Date().toISOString();

      if (!existing) {
        const policy: StoredPrioritizationWeightPolicy & { weights: PrioritizationWeights } = {
          id: randomUUID(),
          workspaceId,
          weights,
          updatedByUserId: actorUserId,
          createdAt: now,
          updatedAt: now,
        };
        await this.policies.insertOne(policy, { session });
        await this.outbox.enqueue(
          {
            scope,
            type: 'prioritization.weights_changed',
            entityType: 'prioritization_weight_policy',
            entityId: policy.id,
            summary: 'Prioritization weights changed',
            source: 'prioritization-policy',
            metadata: { weights: policy.weights, previous: null },
          },
          session,
        );
        return policy;
      }

      const updated = await this.policies.findOneAndUpdate(
        { id: existing.id, workspaceId, updatedAt: existing.updatedAt },
        {
          $set: {
            weights,
            updatedByUserId: actorUserId,
            updatedAt: now,
          },
        },
        { session, returnDocument: 'after' },
      );
      if (!updated) throw new Error('prioritization_weight_policy_update_conflict');

      const effectiveUpdated = { ...updated, weights: effectivePrioritizationWeights(updated.weights) };
      await this.outbox.enqueue(
        {
          scope,
          type: 'prioritization.weights_changed',
          entityType: 'prioritization_weight_policy',
          entityId: effectiveUpdated.id,
          summary: 'Prioritization weights changed',
          source: 'prioritization-policy',
          metadata: {
            weights: effectiveUpdated.weights,
            previous: effectivePrioritizationWeights(existing.weights),
          },
        },
        session,
      );
      return effectiveUpdated;
    });
  }
}
