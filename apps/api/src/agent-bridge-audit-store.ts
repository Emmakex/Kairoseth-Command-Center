import type { Collection, Db } from 'mongodb';
import type { AgentBridgeRuntimeSession } from './agent-bridge-control-store';

export type AgentBridgeAuditEvent = {
  version: 'kab.audit-event.v1';
  eventId: string;
  tenantId: string;
  installationId: string;
  bridgeInstanceId: string;
  type:
    | 'INVOCATION_RECEIVED'
    | 'POLICY_EVALUATED'
    | 'EXECUTION_STARTED'
    | 'EXECUTION_SUCCEEDED'
    | 'EXECUTION_FAILED';
  correlationId: string;
  toolId: string;
  actor: string;
  risk: 'READ' | 'WRITE' | 'CRITICAL';
  occurredAt: string;
  outcome?: 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL';
  message?: string;
  provenance?: {
    version: 'kab.provenance.v1';
    protocol: 'kairoseth-native' | 'mcp' | 'a2a' | 'rest' | 'webhook' | 'internal';
    rootCorrelationId: string;
    parentCorrelationId?: string;
    principal?: {
      issuer: string;
      subject: string;
      authenticationMethod: string;
      clientId?: string;
    };
  };
};

export interface AgentBridgeAuditStore {
  ensureIndexes(): Promise<void>;
  ingestEvents(
    session: AgentBridgeRuntimeSession,
    events: readonly AgentBridgeAuditEvent[],
  ): Promise<string[]>;
}

type AgentBridgeAuditDocument = AgentBridgeAuditEvent & {
  receivedAt: string;
};

export class MongoAgentBridgeAuditStore implements AgentBridgeAuditStore {
  private readonly events: Collection<AgentBridgeAuditDocument>;

  constructor(db: Db) {
    this.events = db.collection('agent_bridge_audit_events');
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.events.createIndex({ eventId: 1 }, { unique: true }),
      this.events.createIndex({ tenantId: 1, installationId: 1, occurredAt: -1 }),
      this.events.createIndex({ tenantId: 1, correlationId: 1, occurredAt: 1 }),
    ]);
  }

  async ingestEvents(
    session: AgentBridgeRuntimeSession,
    events: readonly AgentBridgeAuditEvent[],
  ): Promise<string[]> {
    const accepted: string[] = [];
    for (const event of events) {
      if (
        event.tenantId !== session.tenantId ||
        event.installationId !== session.installationId ||
        event.bridgeInstanceId !== session.bridgeInstanceId
      ) {
        throw new Error('Agent Bridge audit event scope does not match the runtime session.');
      }

      const existing = await this.events.findOne({ eventId: event.eventId });
      if (existing) {
        if (!sameEvent(existing, event)) {
          throw new Error('Agent Bridge audit event ID was reused for different content.');
        }
        accepted.push(event.eventId);
        continue;
      }

      const document: AgentBridgeAuditDocument = {
        ...structuredClone(event),
        receivedAt: new Date().toISOString(),
      };
      try {
        await this.events.insertOne(document);
      } catch (error) {
        const concurrent = await this.events.findOne({ eventId: event.eventId });
        if (!concurrent || !sameEvent(concurrent, event)) throw error;
      }
      accepted.push(event.eventId);
    }
    return accepted;
  }
}

function sameEvent(document: AgentBridgeAuditDocument, event: AgentBridgeAuditEvent): boolean {
  const stored = Object.fromEntries(
    Object.entries(document).filter(([key]) => key !== 'receivedAt' && key !== '_id'),
  );
  return canonicalJson(stored) === canonicalJson(event);
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('Unsupported canonical JSON value');
    }
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw new Error('Unsupported canonical JSON value');
}
