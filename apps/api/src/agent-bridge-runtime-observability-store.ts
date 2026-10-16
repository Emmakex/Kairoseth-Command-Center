import type { Collection, Db } from 'mongodb';

export type AgentBridgeRuntimeLocalization = Partial<
  Record<'es' | 'en', { name: string; description: string }>
>;

export type AgentBridgeRuntimeToolInventory = {
  toolId: string;
  runtimeToolId: string;
  name: string;
  description: string;
  localizations?: AgentBridgeRuntimeLocalization;
  risk: 'READ' | 'WRITE' | 'CRITICAL';
};

export type AgentBridgeRuntimeConnectorInventory = {
  connectorId: string;
  connectorInstanceId: string;
  name: string;
  version: string;
  description: string;
  localizations?: AgentBridgeRuntimeLocalization;
  capabilities: string[];
  tools: AgentBridgeRuntimeToolInventory[];
};

export type AgentBridgeRuntimeToolHealth = {
  toolId: string;
  runtimeToolId: string;
  availability: 'available' | 'degraded' | 'blocked';
  blockedReason?: 'circuit_open' | 'credential_rotation';
};

export type AgentBridgeRuntimeConnectorHealth = {
  connectorId: string;
  connectorInstanceId: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  checkedAt: string;
  tools: AgentBridgeRuntimeToolHealth[];
};

export type AgentBridgeRuntimeSnapshot = {
  version: 'kab.runtime-snapshot.v1';
  snapshotId: string;
  generatedAt: string;
  connectors: AgentBridgeRuntimeConnectorInventory[];
  health: AgentBridgeRuntimeConnectorHealth[];
};

export type AgentBridgeRuntimeIdentity = {
  tenantId: string;
  installationId: string;
  bridgeInstanceId: string;
  sessionId: string;
};

export type AgentBridgeRuntimeRecord = {
  tenantId: string;
  installationId: string;
  bridgeInstanceId: string;
  sessionId: string;
  snapshot: AgentBridgeRuntimeSnapshot;
  receivedAt: string;
};

export type SaveRuntimeSnapshotResult =
  | { ok: true; receivedAt: string; idempotent: boolean }
  | { ok: false; code: 'runtime_snapshot_stale' };

export interface AgentBridgeRuntimeObservabilityStore {
  ensureIndexes(): Promise<void>;
  saveLatest(
    identity: AgentBridgeRuntimeIdentity,
    snapshot: AgentBridgeRuntimeSnapshot,
  ): Promise<SaveRuntimeSnapshotResult>;
  listLatest(tenantId: string): Promise<AgentBridgeRuntimeRecord[]>;
}

type RuntimeDocument = AgentBridgeRuntimeRecord & {
  createdAt: string;
  updatedAt: string;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MongoAgentBridgeRuntimeObservabilityStore
  implements AgentBridgeRuntimeObservabilityStore
{
  private readonly snapshots: Collection<RuntimeDocument>;

  constructor(db: Db) {
    this.snapshots = db.collection<RuntimeDocument>('agent_bridge_runtime_snapshots');
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.snapshots.createIndex(
        { tenantId: 1, installationId: 1 },
        { unique: true },
      ),
      this.snapshots.createIndex({ tenantId: 1, receivedAt: -1 }),
    ]);
  }

  async saveLatest(
    identity: AgentBridgeRuntimeIdentity,
    snapshot: AgentBridgeRuntimeSnapshot,
  ): Promise<SaveRuntimeSnapshotResult> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existing = await this.snapshots.findOne({
        tenantId: identity.tenantId,
        installationId: identity.installationId,
      });

      if (existing?.snapshot.snapshotId === snapshot.snapshotId) {
        return { ok: true, receivedAt: existing.receivedAt, idempotent: true };
      }

      if (
        existing &&
        Date.parse(existing.snapshot.generatedAt) >= Date.parse(snapshot.generatedAt)
      ) {
        return { ok: false, code: 'runtime_snapshot_stale' };
      }

      const receivedAt = new Date().toISOString();
      const replacement = {
        tenantId: identity.tenantId,
        installationId: identity.installationId,
        bridgeInstanceId: identity.bridgeInstanceId,
        sessionId: identity.sessionId,
        snapshot: clone(snapshot),
        receivedAt,
        updatedAt: receivedAt,
      };

      if (!existing) {
        try {
          await this.snapshots.insertOne({ ...replacement, createdAt: receivedAt });
          return { ok: true, receivedAt, idempotent: false };
        } catch (error) {
          if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            (error as { code?: unknown }).code === 11000
          ) {
            continue;
          }
          throw error;
        }
      }

      const updated = await this.snapshots.updateOne(
        {
          tenantId: identity.tenantId,
          installationId: identity.installationId,
          'snapshot.snapshotId': existing.snapshot.snapshotId,
        },
        { $set: replacement },
      );
      if (updated.matchedCount === 1) {
        return { ok: true, receivedAt, idempotent: false };
      }
    }

    const latest = await this.snapshots.findOne({
      tenantId: identity.tenantId,
      installationId: identity.installationId,
    });
    if (latest?.snapshot.snapshotId === snapshot.snapshotId) {
      return { ok: true, receivedAt: latest.receivedAt, idempotent: true };
    }
    return { ok: false, code: 'runtime_snapshot_stale' };
  }

  async listLatest(tenantId: string): Promise<AgentBridgeRuntimeRecord[]> {
    const records = await this.snapshots
      .find({ tenantId })
      .sort({ receivedAt: -1, installationId: 1 })
      .limit(500)
      .toArray();
    return records.map((record) =>
      clone({
        tenantId: record.tenantId,
        installationId: record.installationId,
        bridgeInstanceId: record.bridgeInstanceId,
        sessionId: record.sessionId,
        snapshot: record.snapshot,
        receivedAt: record.receivedAt,
      }),
    );
  }
}
