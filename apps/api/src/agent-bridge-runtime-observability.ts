import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize } from '@kcc/auth';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type {
  AgentBridgeRuntimeConnectorHealth,
  AgentBridgeRuntimeConnectorInventory,
  AgentBridgeRuntimeIdentity,
  AgentBridgeRuntimeLocalization,
  AgentBridgeRuntimeObservabilityStore,
  AgentBridgeRuntimeSnapshot,
  AgentBridgeRuntimeToolHealth,
  AgentBridgeRuntimeToolInventory,
} from './agent-bridge-runtime-observability-store';

const MAX_CONNECTORS = 100;
const MAX_TOOLS_TOTAL = 2_000;
const MAX_CAPABILITIES_PER_CONNECTOR = 100;
const MAX_IDENTIFIER_LENGTH = 512;
const MAX_NAME_LENGTH = 256;
const MAX_DESCRIPTION_LENGTH = 2_000;
const MAX_VERSION_LENGTH = 128;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1_000;
const ONLINE_WINDOW_MS = 150 * 1_000;
const STALE_WINDOW_MS = 10 * 60 * 1_000;

export interface AgentBridgeRuntimeIdentityProvider {
  resolveRuntimeIdentity(input: {
    authorization?: string;
    cookie?: string;
  }): Promise<AgentBridgeRuntimeIdentity | null>;
}

async function resolveSession(
  request: FastifyRequest,
  authProvider?: AuthProvider,
): Promise<SessionContext | null> {
  if (!authProvider) return null;
  const authorization = request.headers.authorization;
  const cookie = request.headers.cookie;
  return authProvider.resolveSession({
    ...(authorization ? { authorization } : {}),
    ...(cookie ? { cookie } : {}),
  });
}

async function resolveRuntimeIdentity(
  request: FastifyRequest,
  provider: AgentBridgeRuntimeIdentityProvider,
): Promise<AgentBridgeRuntimeIdentity | null> {
  const authorization = request.headers.authorization;
  const cookie = request.headers.cookie;
  return provider.resolveRuntimeIdentity({
    ...(authorization ? { authorization } : {}),
    ...(cookie ? { cookie } : {}),
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || hasControlCharacters(normalized)) {
    return null;
  }
  return normalized;
}

function identifier(value: unknown): string | null {
  return text(value, MAX_IDENTIFIER_LENGTH);
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function localization(value: unknown): AgentBridgeRuntimeLocalization | undefined | null {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) return null;
  const result: AgentBridgeRuntimeLocalization = {};
  for (const locale of ['es', 'en'] as const) {
    if (value[locale] === undefined) continue;
    const localized = value[locale];
    if (!isPlainObject(localized)) return null;
    const name = text(localized.name, MAX_NAME_LENGTH);
    const description = text(localized.description, MAX_DESCRIPTION_LENGTH);
    if (!name || !description) return null;
    result[locale] = { name, description };
  }
  return result;
}

function toolInventory(value: unknown): AgentBridgeRuntimeToolInventory | null {
  if (!isPlainObject(value)) return null;
  const toolId = identifier(value.toolId);
  const runtimeToolId = identifier(value.runtimeToolId);
  const name = text(value.name, MAX_NAME_LENGTH);
  const description = text(value.description, MAX_DESCRIPTION_LENGTH);
  const localizations = localization(value.localizations);
  const risk = value.risk;
  if (
    !toolId ||
    !runtimeToolId ||
    !name ||
    !description ||
    localizations === null ||
    (risk !== 'READ' && risk !== 'WRITE' && risk !== 'CRITICAL')
  ) {
    return null;
  }
  return {
    toolId,
    runtimeToolId,
    name,
    description,
    ...(localizations ? { localizations } : {}),
    risk,
  };
}

function connectorInventory(value: unknown): AgentBridgeRuntimeConnectorInventory | null {
  if (!isPlainObject(value)) return null;
  const connectorId = identifier(value.connectorId);
  const connectorInstanceId = identifier(value.connectorInstanceId);
  const name = text(value.name, MAX_NAME_LENGTH);
  const version = text(value.version, MAX_VERSION_LENGTH);
  const description = text(value.description, MAX_DESCRIPTION_LENGTH);
  const localizations = localization(value.localizations);
  if (
    !connectorId ||
    !connectorInstanceId ||
    !name ||
    !version ||
    !description ||
    localizations === null ||
    !Array.isArray(value.capabilities) ||
    value.capabilities.length > MAX_CAPABILITIES_PER_CONNECTOR ||
    !Array.isArray(value.tools)
  ) {
    return null;
  }

  const capabilities = value.capabilities.map(identifier);
  if (capabilities.some((item) => item === null)) return null;
  const tools = value.tools.map(toolInventory);
  if (tools.some((item) => item === null)) return null;

  const parsedTools = tools as AgentBridgeRuntimeToolInventory[];
  if (
    new Set(parsedTools.map((tool) => tool.toolId)).size !== parsedTools.length ||
    new Set(parsedTools.map((tool) => tool.runtimeToolId)).size !== parsedTools.length
  ) {
    return null;
  }

  return {
    connectorId,
    connectorInstanceId,
    name,
    version,
    description,
    ...(localizations ? { localizations } : {}),
    capabilities: [...new Set(capabilities as string[])].sort(),
    tools: parsedTools,
  };
}

function toolHealth(value: unknown): AgentBridgeRuntimeToolHealth | null {
  if (!isPlainObject(value)) return null;
  const toolId = identifier(value.toolId);
  const runtimeToolId = identifier(value.runtimeToolId);
  const availability = value.availability;
  const blockedReason = value.blockedReason;
  if (
    !toolId ||
    !runtimeToolId ||
    (availability !== 'available' && availability !== 'degraded' && availability !== 'blocked') ||
    (blockedReason !== undefined &&
      blockedReason !== 'circuit_open' &&
      blockedReason !== 'credential_rotation')
  ) {
    return null;
  }
  return {
    toolId,
    runtimeToolId,
    availability,
    ...(blockedReason ? { blockedReason } : {}),
  };
}

function connectorHealth(value: unknown): AgentBridgeRuntimeConnectorHealth | null {
  if (!isPlainObject(value)) return null;
  const connectorId = identifier(value.connectorId);
  const connectorInstanceId = identifier(value.connectorInstanceId);
  const checkedAt = isoTimestamp(value.checkedAt);
  const status = value.status;
  if (
    !connectorId ||
    !connectorInstanceId ||
    !checkedAt ||
    (status !== 'healthy' && status !== 'degraded' && status !== 'unhealthy') ||
    !Array.isArray(value.tools)
  ) {
    return null;
  }
  const tools = value.tools.map(toolHealth);
  if (tools.some((item) => item === null)) return null;
  const parsedTools = tools as AgentBridgeRuntimeToolHealth[];
  if (
    new Set(parsedTools.map((tool) => tool.toolId)).size !== parsedTools.length ||
    new Set(parsedTools.map((tool) => tool.runtimeToolId)).size !== parsedTools.length
  ) {
    return null;
  }
  return { connectorId, connectorInstanceId, status, checkedAt, tools: parsedTools };
}

function instanceKey(connectorId: string, connectorInstanceId: string): string {
  return `${connectorId}\u0000${connectorInstanceId}`;
}

function validHealthBinding(
  connectors: AgentBridgeRuntimeConnectorInventory[],
  health: AgentBridgeRuntimeConnectorHealth[],
): boolean {
  if (connectors.length !== health.length) return false;
  const inventory = new Map(
    connectors.map((connector) => [
      instanceKey(connector.connectorId, connector.connectorInstanceId),
      connector,
    ]),
  );
  const healthKeys = health.map((item) => instanceKey(item.connectorId, item.connectorInstanceId));
  if (
    inventory.size !== connectors.length ||
    new Set(healthKeys).size !== health.length
  ) {
    return false;
  }

  for (const item of health) {
    const connector = inventory.get(instanceKey(item.connectorId, item.connectorInstanceId));
    if (!connector || connector.tools.length !== item.tools.length) return false;
    const tools = new Map(connector.tools.map((tool) => [tool.runtimeToolId, tool.toolId]));
    for (const healthTool of item.tools) {
      if (tools.get(healthTool.runtimeToolId) !== healthTool.toolId) return false;
    }
  }
  return true;
}

function runtimeSnapshot(value: unknown): AgentBridgeRuntimeSnapshot | null {
  if (!isPlainObject(value) || value.version !== 'kab.runtime-snapshot.v1') return null;
  const snapshotId = identifier(value.snapshotId);
  const generatedAt = isoTimestamp(value.generatedAt);
  if (
    !snapshotId ||
    !generatedAt ||
    Date.parse(generatedAt) > Date.now() + FUTURE_TOLERANCE_MS ||
    !Array.isArray(value.connectors) ||
    value.connectors.length > MAX_CONNECTORS ||
    !Array.isArray(value.health)
  ) {
    return null;
  }

  const connectors = value.connectors.map(connectorInventory);
  const health = value.health.map(connectorHealth);
  if (connectors.some((item) => item === null) || health.some((item) => item === null)) {
    return null;
  }
  const parsedConnectors = connectors as AgentBridgeRuntimeConnectorInventory[];
  const parsedHealth = health as AgentBridgeRuntimeConnectorHealth[];
  const toolCount = parsedConnectors.reduce((total, connector) => total + connector.tools.length, 0);
  if (toolCount > MAX_TOOLS_TOTAL || !validHealthBinding(parsedConnectors, parsedHealth)) {
    return null;
  }

  return {
    version: 'kab.runtime-snapshot.v1',
    snapshotId,
    generatedAt,
    connectors: parsedConnectors,
    health: parsedHealth,
  };
}

function freshness(receivedAt: string): 'online' | 'stale' | 'offline' {
  const age = Date.now() - Date.parse(receivedAt);
  if (age <= ONLINE_WINDOW_MS) return 'online';
  if (age <= STALE_WINDOW_MS) return 'stale';
  return 'offline';
}

export function registerAgentBridgeRuntimeObservabilityRoutes(
  app: FastifyInstance,
  options: {
    authProvider?: AuthProvider;
    runtimeIdentityProvider?: AgentBridgeRuntimeIdentityProvider;
    runtimeObservabilityStore?: AgentBridgeRuntimeObservabilityStore;
  },
): void {
  app.post('/api/products/agent-bridge/runtime-snapshot', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    if (!options.runtimeObservabilityStore) {
      return reply.code(503).send({ code: 'runtime_observability_store_unavailable' });
    }
    if (!options.runtimeIdentityProvider) {
      return reply.code(503).send({ code: 'runtime_identity_provider_unavailable' });
    }
    const identity = await resolveRuntimeIdentity(request, options.runtimeIdentityProvider);
    if (!identity) return reply.code(401).send({ code: 'runtime_session_required' });

    const body = isPlainObject(request.body) ? request.body : {};
    const snapshot = runtimeSnapshot(body.snapshot);
    if (!snapshot) return reply.code(422).send({ code: 'invalid_runtime_snapshot' });

    const result = await options.runtimeObservabilityStore.saveLatest(identity, snapshot);
    if (!result.ok) return reply.code(409).send({ code: result.code });
    return {
      ack: {
        version: 'kab.runtime-snapshot-ack.v1',
        snapshotId: snapshot.snapshotId,
        receivedAt: result.receivedAt,
      },
    };
  });

  app.get('/api/products/agent-bridge/runtimes', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    if (!options.runtimeObservabilityStore) {
      return reply.code(503).send({ code: 'runtime_observability_store_unavailable' });
    }
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ code: 'unauthorized' });
    if (!session.activeWorkspaceId) return reply.code(400).send({ code: 'workspace_required' });
    if (
      !authorize(session, { product: 'agent-bridge' }) ||
      !authorize(session, { capability: 'integrations.manage' })
    ) {
      return reply.code(403).send({ code: 'agent_bridge_observability_forbidden' });
    }

    const records = await options.runtimeObservabilityStore.listLatest(session.activeWorkspaceId);
    return {
      runtimes: records.map((record) => {
        const toolCount = record.snapshot.connectors.reduce(
          (total, connector) => total + connector.tools.length,
          0,
        );
        const blockedToolCount = record.snapshot.health.reduce(
          (total, connector) =>
            total + connector.tools.filter((tool) => tool.availability === 'blocked').length,
          0,
        );
        const degradedConnectorCount = record.snapshot.health.filter(
          (connector) => connector.status !== 'healthy',
        ).length;
        return {
          installationId: record.installationId,
          bridgeInstanceId: record.bridgeInstanceId,
          snapshotId: record.snapshot.snapshotId,
          generatedAt: record.snapshot.generatedAt,
          receivedAt: record.receivedAt,
          freshness: freshness(record.receivedAt),
          connectorCount: record.snapshot.connectors.length,
          toolCount,
          degradedConnectorCount,
          blockedToolCount,
          connectors: record.snapshot.connectors.map((connector) => ({
            connectorId: connector.connectorId,
            connectorInstanceId: connector.connectorInstanceId,
            name: connector.name,
            version: connector.version,
            localizations: connector.localizations ?? null,
            health:
              record.snapshot.health.find(
                (item) =>
                  item.connectorId === connector.connectorId &&
                  item.connectorInstanceId === connector.connectorInstanceId,
              ) ?? null,
          })),
        };
      }),
    };
  });
}
