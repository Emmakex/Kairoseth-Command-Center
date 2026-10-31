import { createHash, timingSafeEqual } from 'node:crypto';

export const AGENT_BRIDGE_CONSUMER_PERMISSIONS = [
  'tools.read',
  'commands.execute-read',
  'commands.read',
] as const;

export type AgentBridgeConsumerPermission =
  (typeof AGENT_BRIDGE_CONSUMER_PERMISSIONS)[number];

export type AgentBridgeConsumerBinding = {
  consumerId: string;
  tenantId: string;
  installationId: string;
  permissions: readonly AgentBridgeConsumerPermission[];
};

export interface AgentBridgeConsumerAuthProvider {
  resolveConsumer(accessToken: string): Promise<AgentBridgeConsumerBinding | null>;
}

type StaticConsumerBinding = AgentBridgeConsumerBinding & {
  tokenSha256: string;
};

const MAX_BINDINGS = 100;
const MAX_ID = 160;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/;
const SHA256_HEX = /^[0-9a-f]{64}$/i;
const PERMISSIONS = new Set<string>(AGENT_BRIDGE_CONSUMER_PERMISSIONS);

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function id(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_ID || !SAFE_ID.test(normalized)) {
    throw new Error(`${field} is invalid`);
  }
  return normalized;
}

function parsePermissions(value: unknown): AgentBridgeConsumerPermission[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('permissions must be a non-empty array');
  }
  const result: AgentBridgeConsumerPermission[] = [];
  for (const permission of value) {
    if (typeof permission !== 'string' || !PERMISSIONS.has(permission)) {
      throw new Error('permissions contains an unsupported capability');
    }
    if (!result.includes(permission as AgentBridgeConsumerPermission)) {
      result.push(permission as AgentBridgeConsumerPermission);
    }
  }
  return result;
}

export function parseAgentBridgeConsumerBindings(raw: string): StaticConsumerBinding[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('KCC_AGENT_BRIDGE_CONSUMER_BINDINGS_JSON must contain valid JSON');
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_BINDINGS) {
    throw new Error(`consumer bindings must contain between 1 and ${MAX_BINDINGS} entries`);
  }

  const consumers = new Set<string>();
  const tokenHashes = new Set<string>();
  return parsed.map((entry, index) => {
    const body = object(entry);
    if (!body) throw new Error(`consumer binding ${index} must be an object`);
    const allowedKeys = new Set([
      'consumerId',
      'tenantId',
      'installationId',
      'tokenSha256',
      'permissions',
    ]);
    if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
      throw new Error(`consumer binding ${index} contains unsupported fields`);
    }

    const consumerId = id(body.consumerId, `consumer binding ${index}.consumerId`);
    const tenantId = id(body.tenantId, `consumer binding ${index}.tenantId`);
    const installationId = id(body.installationId, `consumer binding ${index}.installationId`);
    const tokenSha256 = typeof body.tokenSha256 === 'string'
      ? body.tokenSha256.trim().toLowerCase()
      : '';
    if (!SHA256_HEX.test(tokenSha256)) {
      throw new Error(`consumer binding ${index}.tokenSha256 must be a SHA-256 hex digest`);
    }
    if (consumers.has(consumerId)) throw new Error(`duplicate consumerId: ${consumerId}`);
    if (tokenHashes.has(tokenSha256)) throw new Error('duplicate consumer token digest');
    consumers.add(consumerId);
    tokenHashes.add(tokenSha256);

    return {
      consumerId,
      tenantId,
      installationId,
      tokenSha256,
      permissions: parsePermissions(body.permissions),
    };
  });
}

export class StaticAgentBridgeConsumerAuthProvider
implements AgentBridgeConsumerAuthProvider {
  private readonly bindings: readonly StaticConsumerBinding[];

  constructor(bindings: readonly StaticConsumerBinding[]) {
    this.bindings = bindings.map((binding) => ({
      ...binding,
      permissions: [...binding.permissions],
    }));
  }

  static fromJson(raw: string): StaticAgentBridgeConsumerAuthProvider {
    return new StaticAgentBridgeConsumerAuthProvider(parseAgentBridgeConsumerBindings(raw));
  }

  async resolveConsumer(accessToken: string): Promise<AgentBridgeConsumerBinding | null> {
    if (!accessToken || accessToken.length > 4096) return null;
    const digest = createHash('sha256').update(accessToken, 'utf8').digest();
    for (const binding of this.bindings) {
      const expected = Buffer.from(binding.tokenSha256, 'hex');
      if (expected.length === digest.length && timingSafeEqual(expected, digest)) {
        return {
          consumerId: binding.consumerId,
          tenantId: binding.tenantId,
          installationId: binding.installationId,
          permissions: [...binding.permissions],
        };
      }
    }
    return null;
  }
}
