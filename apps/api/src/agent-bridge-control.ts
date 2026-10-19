import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize, type AuthProvider, type SessionContext } from '@kcc/auth';
import type { AgentBridgeApprovalService } from './agent-bridge-approval-service';
import type {
  AgentBridgeControlStore,
  AgentBridgeHeartbeat,
  AgentBridgeRegistrationProof,
  AgentBridgeRuntimeSession,
  AgentBridgeRuntimeSnapshot,
  AgentBridgeSessionProof,
} from './agent-bridge-control-store';

const MAX_ID = 512;
const MAX_TEXT = 4096;
const MAX_CAPABILITIES = 256;
const MAX_CONNECTORS = 128;
const MAX_TOOLS_PER_CONNECTOR = 256;

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, max = MAX_ID): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > max) return null;
  for (const character of normalized) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return null;
  }
  return normalized;
}

function multilineText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || value.length > max) return null;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if ((code <= 31 && code !== 10 && code !== 13) || code === 127) return null;
  }
  return value;
}

function timestamp(value: unknown): string | null {
  const parsed = text(value, 64);
  return parsed && Number.isFinite(Date.parse(parsed)) ? parsed : null;
}

function stringArray(value: unknown, maxItems = MAX_CAPABILITIES): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const values: string[] = [];
  for (const item of value) {
    const parsed = text(item, 256);
    if (!parsed) return null;
    values.push(parsed);
  }
  return values;
}

function bearer(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;
  if (!authorization) return null;
  const [scheme, credential] = authorization.trim().split(/\s+/, 2);
  return scheme?.toLowerCase() === 'bearer' && credential ? credential : null;
}

async function operatorSession(
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

function registrationProof(value: unknown): AgentBridgeRegistrationProof | null {
  const proof = object(value);
  const payload = object(proof?.payload);
  if (!proof || !payload) return null;
  const bridgeInstanceId = text(payload.bridgeInstanceId);
  const keyId = text(payload.keyId);
  const publicKeyPem = multilineText(payload.publicKeyPem, 8192);
  const runtimeVersion = text(payload.runtimeVersion, 128);
  const deploymentMode = payload.deploymentMode;
  const capabilities = stringArray(payload.capabilities);
  const nonce = text(payload.nonce);
  const issuedAt = timestamp(payload.issuedAt);
  const signature = text(proof.signature, 2048);
  if (
    payload.version !== 'kab.registration.v1' ||
    !bridgeInstanceId ||
    !keyId ||
    !publicKeyPem ||
    !runtimeVersion ||
    !['hosted', 'local', 'hybrid', 'embedded'].includes(String(deploymentMode)) ||
    !capabilities ||
    !nonce ||
    !issuedAt ||
    !signature
  ) {
    return null;
  }
  return {
    payload: {
      version: 'kab.registration.v1',
      bridgeInstanceId,
      keyId,
      publicKeyPem,
      runtimeVersion,
      deploymentMode: deploymentMode as 'hosted' | 'local' | 'hybrid' | 'embedded',
      capabilities,
      nonce,
      issuedAt,
    },
    signature,
  };
}

function sessionProof(value: unknown): AgentBridgeSessionProof | null {
  const proof = object(value);
  const payload = object(proof?.payload);
  if (!proof || !payload) return null;
  const tenantId = text(payload.tenantId);
  const installationId = text(payload.installationId);
  const bridgeInstanceId = text(payload.bridgeInstanceId);
  const keyId = text(payload.keyId);
  const nonce = text(payload.nonce);
  const issuedAt = timestamp(payload.issuedAt);
  const signature = text(proof.signature, 2048);
  if (
    payload.version !== 'kab.session-proof.v1' ||
    !tenantId ||
    !installationId ||
    !bridgeInstanceId ||
    !keyId ||
    !nonce ||
    !issuedAt ||
    !signature
  ) {
    return null;
  }
  return {
    payload: {
      version: 'kab.session-proof.v1',
      tenantId,
      installationId,
      bridgeInstanceId,
      keyId,
      nonce,
      issuedAt,
    },
    signature,
  };
}

function heartbeat(value: unknown): AgentBridgeHeartbeat | null {
  const item = object(value);
  if (!item) return null;
  const sessionId = text(item.sessionId);
  const tenantId = text(item.tenantId);
  const installationId = text(item.installationId);
  const bridgeInstanceId = text(item.bridgeInstanceId);
  const sentAt = timestamp(item.sentAt);
  const readiness = item.readiness;
  const runtimeVersion = text(item.runtimeVersion, 128);
  const capabilities = stringArray(item.capabilities);
  if (
    item.version !== 'kab.heartbeat.v1' ||
    !sessionId ||
    !tenantId ||
    !installationId ||
    !bridgeInstanceId ||
    !sentAt ||
    !['starting', 'ready', 'degraded'].includes(String(readiness)) ||
    !runtimeVersion ||
    !capabilities
  ) {
    return null;
  }
  return {
    version: 'kab.heartbeat.v1',
    sessionId,
    tenantId,
    installationId,
    bridgeInstanceId,
    sentAt,
    readiness: readiness as 'starting' | 'ready' | 'degraded',
    runtimeVersion,
    capabilities,
  };
}

function localizations(value: unknown): Record<string, unknown> | undefined | null {
  if (value === undefined) return undefined;
  const source = object(value);
  if (!source) return null;
  const result: Record<string, unknown> = {};
  for (const locale of ['es', 'en'] as const) {
    if (source[locale] === undefined) continue;
    const localized = object(source[locale]);
    const name = text(localized?.name, 512);
    const description = text(localized?.description, MAX_TEXT);
    if (!localized || !name || !description) return null;
    result[locale] = { name, description };
  }
  if (Object.keys(source).some((key) => key !== 'es' && key !== 'en')) return null;
  return result;
}

function runtimeSnapshot(value: unknown): AgentBridgeRuntimeSnapshot | null {
  const snapshot = object(value);
  if (!snapshot) return null;
  const snapshotId = text(snapshot.snapshotId);
  const generatedAt = timestamp(snapshot.generatedAt);
  if (
    snapshot.version !== 'kab.runtime-snapshot.v1' ||
    !snapshotId ||
    !generatedAt ||
    !Array.isArray(snapshot.connectors) ||
    snapshot.connectors.length > MAX_CONNECTORS ||
    !Array.isArray(snapshot.health) ||
    snapshot.health.length > MAX_CONNECTORS
  ) {
    return null;
  }

  const connectors: AgentBridgeRuntimeSnapshot['connectors'] = [];
  const inventoryKeys = new Set<string>();
  const inventoryTools = new Map<string, Set<string>>();
  for (const rawConnector of snapshot.connectors) {
    const connector = object(rawConnector);
    if (!connector || !Array.isArray(connector.tools) || connector.tools.length > MAX_TOOLS_PER_CONNECTOR) {
      return null;
    }
    const connectorId = text(connector.connectorId);
    const connectorInstanceId = text(connector.connectorInstanceId);
    const name = text(connector.name, 512);
    const version = text(connector.version, 128);
    const description = text(connector.description, MAX_TEXT);
    const capabilities = stringArray(connector.capabilities);
    const localized = localizations(connector.localizations);
    if (!connectorId || !connectorInstanceId || !name || !version || !description || !capabilities || localized === null) {
      return null;
    }
    const key = `${connectorId}\u0000${connectorInstanceId}`;
    if (inventoryKeys.has(key)) return null;
    inventoryKeys.add(key);

    const tools: AgentBridgeRuntimeSnapshot['connectors'][number]['tools'] = [];
    const toolKeys = new Set<string>();
    for (const rawTool of connector.tools) {
      const tool = object(rawTool);
      if (!tool) return null;
      const toolId = text(tool.toolId);
      const runtimeToolId = text(tool.runtimeToolId);
      const toolName = text(tool.name, 512);
      const toolDescription = text(tool.description, MAX_TEXT);
      const toolLocalized = localizations(tool.localizations);
      const risk = tool.risk;
      if (
        !toolId ||
        !runtimeToolId ||
        !toolName ||
        !toolDescription ||
        toolLocalized === null ||
        !['READ', 'WRITE', 'CRITICAL'].includes(String(risk)) ||
        toolKeys.has(runtimeToolId)
      ) {
        return null;
      }
      toolKeys.add(runtimeToolId);
      tools.push({
        toolId,
        runtimeToolId,
        name: toolName,
        description: toolDescription,
        ...(toolLocalized ? { localizations: toolLocalized } : {}),
        risk: risk as 'READ' | 'WRITE' | 'CRITICAL',
      });
    }
    inventoryTools.set(key, toolKeys);
    connectors.push({
      connectorId,
      connectorInstanceId,
      name,
      version,
      description,
      ...(localized ? { localizations: localized } : {}),
      capabilities,
      tools,
    });
  }

  const health: AgentBridgeRuntimeSnapshot['health'] = [];
  const healthKeys = new Set<string>();
  for (const rawHealth of snapshot.health) {
    const item = object(rawHealth);
    if (!item || !Array.isArray(item.tools) || item.tools.length > MAX_TOOLS_PER_CONNECTOR) return null;
    const connectorId = text(item.connectorId);
    const connectorInstanceId = text(item.connectorInstanceId);
    const status = item.status;
    const checkedAt = timestamp(item.checkedAt);
    if (
      !connectorId ||
      !connectorInstanceId ||
      !['healthy', 'degraded', 'unhealthy'].includes(String(status)) ||
      !checkedAt
    ) {
      return null;
    }
    const key = `${connectorId}\u0000${connectorInstanceId}`;
    if (!inventoryKeys.has(key) || healthKeys.has(key)) return null;
    healthKeys.add(key);
    const expectedTools = inventoryTools.get(key) ?? new Set<string>();
    const seenTools = new Set<string>();
    const tools: AgentBridgeRuntimeSnapshot['health'][number]['tools'] = [];
    for (const rawTool of item.tools) {
      const tool = object(rawTool);
      const toolId = text(tool?.toolId);
      const runtimeToolId = text(tool?.runtimeToolId);
      const availability = tool?.availability;
      const blockedReason = tool?.blockedReason;
      if (
        !tool ||
        !toolId ||
        !runtimeToolId ||
        !expectedTools.has(runtimeToolId) ||
        seenTools.has(runtimeToolId) ||
        !['available', 'degraded', 'blocked'].includes(String(availability)) ||
        (blockedReason !== undefined && !['circuit_open', 'credential_rotation'].includes(String(blockedReason)))
      ) {
        return null;
      }
      seenTools.add(runtimeToolId);
      tools.push({
        toolId,
        runtimeToolId,
        availability: availability as 'available' | 'degraded' | 'blocked',
        ...(blockedReason
          ? { blockedReason: blockedReason as 'circuit_open' | 'credential_rotation' }
          : {}),
      });
    }
    if (seenTools.size !== expectedTools.size) return null;
    health.push({
      connectorId,
      connectorInstanceId,
      status: status as 'healthy' | 'degraded' | 'unhealthy',
      checkedAt,
      tools,
    });
  }
  if (healthKeys.size !== inventoryKeys.size) return null;

  return {
    version: 'kab.runtime-snapshot.v1',
    snapshotId,
    generatedAt,
    connectors,
    health,
  };
}

async function runtimeSession(
  request: FastifyRequest,
  store?: AgentBridgeControlStore,
): Promise<AgentBridgeRuntimeSession | null> {
  const token = bearer(request);
  return token && store ? store.resolveRuntimeSession(token) : null;
}

export function registerAgentBridgeControlRoutes(
  app: FastifyInstance,
  options: {
    authProvider?: AuthProvider;
    controlStore?: AgentBridgeControlStore;
    approvalService?: AgentBridgeApprovalService;
  },
): void {
  const store = options.controlStore;

  app.post('/v1/products/agent-bridge/enrollment-tokens', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const session = await operatorSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ code: 'unauthorized' });
    if (!session.activeWorkspaceId) return reply.code(400).send({ code: 'workspace_required' });
    if (
      !authorize(session, { product: 'agent-bridge', capability: 'workspace.manage' })
    ) {
      return reply.code(403).send({ code: 'agent_bridge_forbidden' });
    }
    if (!store) return reply.code(503).send({ code: 'agent_bridge_control_unavailable' });

    const issued = await store.issueEnrollmentToken({
      tenantId: session.activeWorkspaceId,
      createdBy: session.user.id,
    });
    return reply.code(201).send({
      version: 'kcc.agent-bridge-enrollment-token.v1',
      token: issued.token,
      expiresAt: issued.expiresAt,
    });
  });

  app.post('/api/products/agent-bridge/enrollment/challenge', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const token = bearer(request);
    if (!token || !store) return reply.code(401).send({ code: 'invalid_enrollment_token' });
    const challenge = await store.createEnrollmentChallenge(token);
    if (!challenge) return reply.code(401).send({ code: 'invalid_enrollment_token' });
    return {
      version: 'kab.enrollment-challenge.v1',
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
    };
  });

  app.post('/api/products/agent-bridge/enrollment/register', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const token = bearer(request);
    const body = object(request.body);
    const proof = registrationProof(body?.proof);
    if (!token || !proof || !store) {
      return reply.code(400).send({ code: 'invalid_registration_request' });
    }
    const binding = await store.registerInstallation(token, proof);
    if (!binding) return reply.code(401).send({ code: 'registration_rejected' });
    return {
      binding: {
        version: 'kab.installation-binding.v1',
        ...binding,
        trustedApprovalKeys: options.approvalService
          ? [options.approvalService.trustedKey()]
          : [],
      },
    };
  });

  app.post('/api/products/agent-bridge/session/challenge', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const body = object(request.body);
    const tenantId = text(body?.tenantId);
    const installationId = text(body?.installationId);
    const bridgeInstanceId = text(body?.bridgeInstanceId);
    const keyId = text(body?.keyId);
    if (!tenantId || !installationId || !bridgeInstanceId || !keyId || !store) {
      return reply.code(400).send({ code: 'invalid_session_challenge_request' });
    }
    const challenge = await store.createSessionChallenge({
      tenantId,
      installationId,
      bridgeInstanceId,
      keyId,
    });
    if (!challenge) return reply.code(401).send({ code: 'installation_not_authorized' });
    return {
      version: 'kab.session-challenge.v1',
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
    };
  });

  app.post('/api/products/agent-bridge/session/open', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const body = object(request.body);
    const proof = sessionProof(body?.proof);
    if (!proof || !store) return reply.code(400).send({ code: 'invalid_session_proof' });
    const credential = await store.openSession(proof);
    if (!credential) return reply.code(401).send({ code: 'session_rejected' });
    return { credential: { version: 'kab.session-credential.v1', ...credential } };
  });

  app.post('/api/products/agent-bridge/session/heartbeat', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const session = await runtimeSession(request, store);
    if (!session) return reply.code(401).send({ code: 'invalid_runtime_session' });
    const body = object(request.body);
    const parsed = heartbeat(body?.heartbeat);
    if (!parsed) return reply.code(400).send({ code: 'invalid_heartbeat' });
    const result = await store?.recordHeartbeat(session, parsed);
    if (!result) return reply.code(409).send({ code: 'heartbeat_scope_mismatch' });
    return {
      ack: {
        version: 'kab.heartbeat-ack.v1',
        receivedAt: result.receivedAt,
        nextHeartbeatInSeconds: result.nextHeartbeatInSeconds,
      },
    };
  });

  app.post('/api/products/agent-bridge/runtime-snapshot', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const session = await runtimeSession(request, store);
    if (!session) return reply.code(401).send({ code: 'invalid_runtime_session' });
    const body = object(request.body);
    const snapshot = runtimeSnapshot(body?.snapshot);
    if (!snapshot) return reply.code(400).send({ code: 'invalid_runtime_snapshot' });
    const result = await store?.recordRuntimeSnapshot(session, snapshot);
    if (!result) return reply.code(409).send({ code: 'runtime_snapshot_rejected' });
    return {
      ack: {
        version: 'kab.runtime-snapshot-ack.v1',
        snapshotId: result.snapshotId,
        receivedAt: result.receivedAt,
      },
    };
  });
}
