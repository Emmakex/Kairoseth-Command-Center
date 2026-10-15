import type { Collection, Db, Filter } from 'mongodb';
import type { IntegrationSignal, IntegrationSignalType } from '@kcc/integrations';

export type IntegrationSignalWriteResult = {
  received: number;
  upserted: number;
  matched: number;
  modified: number;
};

export type ListIntegrationSignalsInput = {
  workspaceId: string;
  resourceId?: string;
  projectId?: string;
  types?: IntegrationSignalType[];
  limit?: number;
};

export interface IntegrationSignalStore {
  ensureIndexes(): Promise<void>;
  upsertSignals(workspaceId: string, signals: IntegrationSignal[]): Promise<IntegrationSignalWriteResult>;
  listSignals(input: ListIntegrationSignalsInput): Promise<IntegrationSignal[]>;
}

type IntegrationSignalDocument = IntegrationSignal & {
  resourceId?: string | null;
  projectId?: string | null;
  ingestedAt: string;
  updatedAt: string;
};

function boundedLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 50;
  return Math.max(1, Math.min(100, Math.floor(value)));
}

function payloadText(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 200 ? normalized : undefined;
}

function toSignal(document: IntegrationSignalDocument): IntegrationSignal {
  return {
    id: document.id,
    source: document.source,
    type: document.type,
    workspaceId: document.workspaceId,
    occurredAt: document.occurredAt,
    payload: document.payload,
  };
}

export class MongoIntegrationSignalStore implements IntegrationSignalStore {
  private readonly signals: Collection<IntegrationSignalDocument>;

  constructor(db: Db) {
    this.signals = db.collection<IntegrationSignalDocument>('integration_signals');
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.signals.createIndex({ workspaceId: 1, id: 1 }, { unique: true }),
      this.signals.createIndex({ workspaceId: 1, occurredAt: -1, id: 1 }),
      this.signals.createIndex({ workspaceId: 1, resourceId: 1, occurredAt: -1 }),
      this.signals.createIndex({ workspaceId: 1, projectId: 1, occurredAt: -1 }),
      this.signals.createIndex({ workspaceId: 1, type: 1, occurredAt: -1 }),
    ]);
  }

  async upsertSignals(
    workspaceId: string,
    signals: IntegrationSignal[],
  ): Promise<IntegrationSignalWriteResult> {
    if (signals.length === 0) {
      return { received: 0, upserted: 0, matched: 0, modified: 0 };
    }

    for (const signal of signals) {
      if (signal.workspaceId !== workspaceId) {
        throw new Error('integration_signal_workspace_mismatch');
      }
      if (!signal.id.trim()) throw new Error('integration_signal_id_required');
      if (!Number.isFinite(Date.parse(signal.occurredAt))) {
        throw new Error('integration_signal_occurred_at_invalid');
      }
    }

    const uniqueSignals = [...new Map(signals.map((signal) => [signal.id, signal])).values()];
    const now = new Date().toISOString();
    const result = await this.signals.bulkWrite(
      uniqueSignals.map((signal) => {
        const resourceId = payloadText(signal.payload, 'resourceId');
        const projectId = payloadText(signal.payload, 'projectId');
        const stored: Omit<IntegrationSignalDocument, 'ingestedAt'> = {
          ...signal,
          resourceId: resourceId ?? null,
          projectId: projectId ?? null,
          updatedAt: now,
        };
        return {
          updateOne: {
            filter: { workspaceId, id: signal.id },
            update: {
              $set: stored,
              $setOnInsert: { ingestedAt: now },
            },
            upsert: true,
          },
        };
      }),
      { ordered: false },
    );

    return {
      received: signals.length,
      upserted: result.upsertedCount,
      matched: result.matchedCount,
      modified: result.modifiedCount,
    };
  }

  async listSignals(input: ListIntegrationSignalsInput): Promise<IntegrationSignal[]> {
    const filter: Filter<IntegrationSignalDocument> = { workspaceId: input.workspaceId };
    if (input.resourceId) filter.resourceId = input.resourceId;
    if (input.projectId) filter.projectId = input.projectId;
    if (input.types && input.types.length > 0) filter.type = { $in: input.types };

    const documents = await this.signals
      .find(filter)
      .sort({ occurredAt: -1, id: 1 })
      .limit(boundedLimit(input.limit))
      .toArray();

    return documents.map(toSignal);
  }
}
