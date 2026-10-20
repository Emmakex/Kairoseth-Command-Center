import type { Collection, Db } from 'mongodb';

export type AgentBridgeToolRisk = 'READ' | 'WRITE' | 'CRITICAL';
export type AgentBridgeToolAvailability = 'available' | 'degraded' | 'blocked';
export type AgentBridgeToolBlockedReason = 'circuit_open' | 'credential_rotation';

type LocalizedToolCopy = {
  name: string;
  description: string;
};

export type AgentBridgeOperatorTool = {
  executionToolId: string;
  name: string;
  description: string;
  risk: AgentBridgeToolRisk;
  availability: AgentBridgeToolAvailability;
  blockedReason?: AgentBridgeToolBlockedReason;
  localizations?: Partial<Record<'es' | 'en', LocalizedToolCopy>>;
  connector: {
    connectorId: string;
    name: string;
    version: string;
  };
};

export type AgentBridgeToolInventory = {
  installationId: string;
  snapshotId: string;
  generatedAt: string;
  receivedAt: string;
  tools: AgentBridgeOperatorTool[];
};

export interface AgentBridgeToolInventoryStore {
  getInstallationTools(
    tenantId: string,
    installationId: string,
  ): Promise<AgentBridgeToolInventory | null>;
}

type InstallationDocument = {
  tenantId: string;
  installationId: string;
  status: 'active' | 'revoked';
};

type RuntimeSnapshotDocument = {
  tenantId: string;
  installationId: string;
  snapshotId: string;
  generatedAt: string;
  receivedAt: string;
  snapshot: {
    connectors: Array<{
      connectorId: string;
      connectorInstanceId: string;
      name: string;
      version: string;
      tools: Array<{
        runtimeToolId: string;
        name: string;
        description: string;
        localizations?: Record<string, unknown>;
        risk: AgentBridgeToolRisk;
      }>;
    }>;
    health: Array<{
      connectorId: string;
      connectorInstanceId: string;
      tools: Array<{
        runtimeToolId: string;
        availability: AgentBridgeToolAvailability;
        blockedReason?: AgentBridgeToolBlockedReason;
      }>;
    }>;
  };
};

function safeLocalizations(
  value: Record<string, unknown> | undefined,
): Partial<Record<'es' | 'en', LocalizedToolCopy>> | undefined {
  if (!value) return undefined;
  const result: Partial<Record<'es' | 'en', LocalizedToolCopy>> = {};
  for (const locale of ['es', 'en'] as const) {
    const localized = value[locale];
    if (!localized || typeof localized !== 'object' || Array.isArray(localized)) continue;
    const record = localized as Record<string, unknown>;
    if (typeof record.name !== 'string' || typeof record.description !== 'string') continue;
    result[locale] = { name: record.name, description: record.description };
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function healthKey(connectorId: string, connectorInstanceId: string, runtimeToolId: string): string {
  return `${connectorId}\u0000${connectorInstanceId}\u0000${runtimeToolId}`;
}

export class MongoAgentBridgeToolInventoryStore implements AgentBridgeToolInventoryStore {
  private readonly installations: Collection<InstallationDocument>;
  private readonly snapshots: Collection<RuntimeSnapshotDocument>;

  constructor(db: Db) {
    this.installations = db.collection('agent_bridge_installations');
    this.snapshots = db.collection('agent_bridge_runtime_snapshots');
  }

  async getInstallationTools(
    tenantId: string,
    installationId: string,
  ): Promise<AgentBridgeToolInventory | null> {
    const installation = await this.installations.findOne({
      tenantId,
      installationId,
      status: 'active',
    });
    if (!installation) return null;

    const snapshot = await this.snapshots.findOne({ tenantId, installationId });
    if (!snapshot) return null;

    const health = new Map<
      string,
      { availability: AgentBridgeToolAvailability; blockedReason?: AgentBridgeToolBlockedReason }
    >();
    for (const connector of snapshot.snapshot.health) {
      for (const tool of connector.tools) {
        health.set(
          healthKey(connector.connectorId, connector.connectorInstanceId, tool.runtimeToolId),
          {
            availability: tool.availability,
            ...(tool.blockedReason ? { blockedReason: tool.blockedReason } : {}),
          },
        );
      }
    }

    const tools: AgentBridgeOperatorTool[] = [];
    for (const connector of snapshot.snapshot.connectors) {
      for (const tool of connector.tools) {
        const runtimeHealth = health.get(
          healthKey(connector.connectorId, connector.connectorInstanceId, tool.runtimeToolId),
        );
        const localizations = safeLocalizations(tool.localizations);
        tools.push({
          executionToolId: tool.runtimeToolId,
          name: tool.name,
          description: tool.description,
          risk: tool.risk,
          availability: runtimeHealth?.availability ?? 'blocked',
          ...(runtimeHealth?.blockedReason ? { blockedReason: runtimeHealth.blockedReason } : {}),
          ...(localizations ? { localizations } : {}),
          connector: {
            connectorId: connector.connectorId,
            name: connector.name,
            version: connector.version,
          },
        });
      }
    }
    tools.sort((left, right) => left.executionToolId.localeCompare(right.executionToolId));

    return {
      installationId,
      snapshotId: snapshot.snapshotId,
      generatedAt: snapshot.generatedAt,
      receivedAt: snapshot.receivedAt,
      tools,
    };
  }
}
