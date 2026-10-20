export type AgentBridgeOperatorTool = {
  executionToolId: string;
  name: string;
  description: string;
  risk: 'READ' | 'WRITE' | 'CRITICAL';
  availability: 'available' | 'degraded' | 'blocked';
  blockedReason?: 'circuit_open' | 'credential_rotation';
  localizations?: Partial<Record<'es' | 'en', { name: string; description: string }>>;
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

type AgentBridgeToolInventoryResponse = {
  version: 'kcc.agent-bridge-tool-inventory.v1';
  inventory: AgentBridgeToolInventory;
};

const RISKS = new Set(['READ', 'WRITE', 'CRITICAL']);
const AVAILABILITY = new Set(['available', 'degraded', 'blocked']);
const BLOCKED_REASONS = new Set(['circuit_open', 'credential_rotation']);
const MAX_TOOLS = 1000;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > max) return null;
  for (const character of normalized) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return null;
  }
  return normalized;
}

function timestamp(value: unknown): string | null {
  const parsed = safeText(value, 64);
  return parsed && Number.isFinite(Date.parse(parsed)) ? parsed : null;
}

function localizedCopy(value: unknown): { name: string; description: string } | null {
  const body = record(value);
  const name = safeText(body?.name, 1024);
  const description = safeText(body?.description, 8192);
  return body && name && description ? { name, description } : null;
}

function tool(value: unknown): AgentBridgeOperatorTool | null {
  const body = record(value);
  if (!body) return null;

  const executionToolId = safeText(body.executionToolId, 512);
  const name = safeText(body.name, 1024);
  const description = safeText(body.description, 8192);
  const connector = record(body.connector);
  const connectorId = safeText(connector?.connectorId, 512);
  const connectorName = safeText(connector?.name, 1024);
  const connectorVersion = safeText(connector?.version, 256);
  const risk = body.risk;
  const availability = body.availability;
  const blockedReason = body.blockedReason;

  if (
    !executionToolId ||
    !name ||
    !description ||
    !connector ||
    !connectorId ||
    !connectorName ||
    !connectorVersion ||
    !RISKS.has(String(risk)) ||
    !AVAILABILITY.has(String(availability)) ||
    (blockedReason !== undefined && !BLOCKED_REASONS.has(String(blockedReason)))
  ) {
    return null;
  }

  const localizationsBody = body.localizations === undefined ? null : record(body.localizations);
  if (body.localizations !== undefined && !localizationsBody) return null;
  const localizations: Partial<Record<'es' | 'en', { name: string; description: string }>> = {};
  if (localizationsBody) {
    for (const locale of ['es', 'en'] as const) {
      if (localizationsBody[locale] === undefined) continue;
      const parsed = localizedCopy(localizationsBody[locale]);
      if (!parsed) return null;
      localizations[locale] = parsed;
    }
  }

  return {
    executionToolId,
    name,
    description,
    risk: risk as AgentBridgeOperatorTool['risk'],
    availability: availability as AgentBridgeOperatorTool['availability'],
    ...(blockedReason
      ? {
          blockedReason: blockedReason as NonNullable<AgentBridgeOperatorTool['blockedReason']>,
        }
      : {}),
    ...(Object.keys(localizations).length > 0 ? { localizations } : {}),
    connector: {
      connectorId,
      name: connectorName,
      version: connectorVersion,
    },
  };
}

export function parseAgentBridgeToolInventoryResponse(
  value: unknown,
): AgentBridgeToolInventoryResponse | null {
  const body = record(value);
  const inventory = record(body?.inventory);
  if (body?.version !== 'kcc.agent-bridge-tool-inventory.v1' || !inventory) return null;

  const installationId = safeText(inventory.installationId, 512);
  const snapshotId = safeText(inventory.snapshotId, 512);
  const generatedAt = timestamp(inventory.generatedAt);
  const receivedAt = timestamp(inventory.receivedAt);
  if (
    !installationId ||
    !snapshotId ||
    !generatedAt ||
    !receivedAt ||
    !Array.isArray(inventory.tools) ||
    inventory.tools.length > MAX_TOOLS
  ) {
    return null;
  }

  const tools = inventory.tools.map(tool);
  if (tools.some((item) => item === null)) return null;

  const ids = new Set<string>();
  for (const item of tools as AgentBridgeOperatorTool[]) {
    if (ids.has(item.executionToolId)) return null;
    ids.add(item.executionToolId);
  }

  return {
    version: 'kcc.agent-bridge-tool-inventory.v1',
    inventory: {
      installationId,
      snapshotId,
      generatedAt,
      receivedAt,
      tools: tools as AgentBridgeOperatorTool[],
    },
  };
}
