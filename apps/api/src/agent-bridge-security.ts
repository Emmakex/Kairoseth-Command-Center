import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize, type AuthProvider, type SessionContext } from '@kcc/auth';
import type { AgentBridgeApprovalService } from './agent-bridge-approval-store';
import type {
  AgentBridgeAuditBatch,
  AgentBridgeAuditEvent,
  AgentBridgeAuditStore,
} from './agent-bridge-audit-store';
import type { AgentBridgeControlStore, AgentBridgeRuntimeSession } from './agent-bridge-control-store';

const MAX_ID = 512;
const MAX_TEXT = 4096;
const MAX_AUDIT_EVENTS = 500;
const MAX_AUDIT_MESSAGE = 512;

const SECRET_PATTERNS: readonly RegExp[] = [
  /kab1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /kabd1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /Bearer\s+[A-Za-z0-9._~+\x2F-]+/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|authorization)\b\s*[:=]\s*[^\s,;]+/gi,
];

type AuditProvenance = NonNullable<AgentBridgeAuditEvent['provenance']>;
type AuditPrincipal = NonNullable<AuditProvenance['principal']>;
type AuditProtocol = AuditProvenance['protocol'];

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

function optionalText(value: unknown, max = MAX_TEXT): string | undefined | null {
  if (value === undefined) return undefined;
  return text(value, max);
}

function timestamp(value: unknown): string | null {
  const parsed = text(value, 64);
  return parsed && Number.isFinite(Date.parse(parsed)) ? parsed : null;
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

async function runtimeSession(
  request: FastifyRequest,
  store?: AgentBridgeControlStore,
): Promise<AgentBridgeRuntimeSession | null> {
  const token = bearer(request);
  return token && store ? store.resolveRuntimeSession(token) : null;
}

function principal(value: unknown): AuditPrincipal | undefined | null {
  if (value === undefined) return undefined;
  const item = object(value);
  if (!item) return null;
  const issuer = text(item.issuer);
  const subject = text(item.subject);
  const authenticationMethod = text(item.authenticationMethod);
  const clientId = optionalText(item.clientId, MAX_ID);
  if (!issuer || !subject || !authenticationMethod || clientId === null) return null;
  return {
    issuer,
    subject,
    authenticationMethod,
    ...(clientId ? { clientId } : {}),
  };
}

function provenance(value: unknown): AuditProvenance | undefined | null {
  if (value === undefined) return undefined;
  const item = object(value);
  if (!item) return null;
  const protocol = item.protocol;
  const rootCorrelationId = text(item.rootCorrelationId);
  const parentCorrelationId = optionalText(item.parentCorrelationId, MAX_ID);
  const parsedPrincipal = principal(item.principal);
  if (
    item.version !== 'kab.provenance.v1' ||
    !['kairoseth-native', 'mcp', 'a2a', 'rest', 'webhook', 'internal'].includes(String(protocol)) ||
    !rootCorrelationId ||
    parentCorrelationId === null ||
    parsedPrincipal === null
  ) {
    return null;
  }
  return {
    version: 'kab.provenance.v1',
    protocol: protocol as AuditProtocol,
    rootCorrelationId,
    ...(parentCorrelationId ? { parentCorrelationId } : {}),
    ...(parsedPrincipal ? { principal: parsedPrincipal } : {}),
  };
}

function auditMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let sanitized = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    const isAllowedWhitespace = codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d;
    return isAllowedWhitespace || (codePoint >= 0x20 && codePoint !== 0x7f) ? character : '';
  }).join('');
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, (_match, secretName?: string) =>
      typeof secretName === 'string' && secretName.length > 0
        ? `${secretName}=[REDACTED]`
        : '[REDACTED]',
    );
  }
  return sanitized.slice(0, MAX_AUDIT_MESSAGE);
}

function auditEvent(value: unknown): AgentBridgeAuditEvent | null {
  const item = object(value);
  if (!item) return null;
  const eventId = text(item.eventId);
  const tenantId = text(item.tenantId);
  const installationId = text(item.installationId);
  const bridgeInstanceId = text(item.bridgeInstanceId);
  const correlationId = text(item.correlationId);
  const toolId = text(item.toolId);
  const actor = text(item.actor, MAX_TEXT);
  const occurredAt = timestamp(item.occurredAt);
  const message = item.message === undefined ? undefined : auditMessage(item.message);
  const parsedProvenance = provenance(item.provenance);
  const type = item.type;
  const risk = item.risk;
  const outcome = item.outcome;
  if (
    item.version !== 'kab.audit-event.v1' ||
    !eventId ||
    !tenantId ||
    !installationId ||
    !bridgeInstanceId ||
    !['INVOCATION_RECEIVED', 'POLICY_EVALUATED', 'EXECUTION_STARTED', 'EXECUTION_SUCCEEDED', 'EXECUTION_FAILED'].includes(String(type)) ||
    !correlationId ||
    !toolId ||
    !actor ||
    !['READ', 'WRITE', 'CRITICAL'].includes(String(risk)) ||
    !occurredAt ||
    (outcome !== undefined && !['ALLOW', 'DENY', 'REQUIRE_APPROVAL'].includes(String(outcome))) ||
    message === null ||
    parsedProvenance === null
  ) {
    return null;
  }
  return {
    version: 'kab.audit-event.v1',
    eventId,
    tenantId,
    installationId,
    bridgeInstanceId,
    type: type as AgentBridgeAuditEvent['type'],
    correlationId,
    toolId,
    actor,
    risk: risk as AgentBridgeAuditEvent['risk'],
    occurredAt,
    ...(outcome ? { outcome: outcome as NonNullable<AgentBridgeAuditEvent['outcome']> } : {}),
    ...(message ? { message } : {}),
    ...(parsedProvenance ? { provenance: parsedProvenance } : {}),
  };
}

function auditBatch(value: unknown): AgentBridgeAuditBatch | null {
  const batch = object(value);
  if (!batch || !Array.isArray(batch.events) || batch.events.length > MAX_AUDIT_EVENTS) return null;
  const batchId = text(batch.batchId);
  const sessionId = text(batch.sessionId);
  const tenantId = text(batch.tenantId);
  const installationId = text(batch.installationId);
  const bridgeInstanceId = text(batch.bridgeInstanceId);
  if (
    batch.version !== 'kab.audit-batch.v1' ||
    !batchId ||
    !sessionId ||
    !tenantId ||
    !installationId ||
    !bridgeInstanceId
  ) {
    return null;
  }
  const events: AgentBridgeAuditEvent[] = [];
  const eventIds = new Set<string>();
  for (const rawEvent of batch.events) {
    const event = auditEvent(rawEvent);
    if (!event || eventIds.has(event.eventId)) return null;
    eventIds.add(event.eventId);
    events.push(event);
  }
  return {
    version: 'kab.audit-batch.v1',
    batchId,
    sessionId,
    tenantId,
    installationId,
    bridgeInstanceId,
    events,
  };
}

export function registerAgentBridgeSecurityRoutes(
  app: FastifyInstance,
  options: {
    authProvider?: AuthProvider;
    controlStore?: AgentBridgeControlStore;
    approvalService?: AgentBridgeApprovalService;
    auditStore?: AgentBridgeAuditStore;
  },
): void {
  app.get('/v1/products/agent-bridge/approval-keys/rotation', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const session = await operatorSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ code: 'unauthorized' });
    if (!session.activeWorkspaceId) return reply.code(400).send({ code: 'workspace_required' });
    if (!authorize(session, { product: 'agent-bridge', capability: 'workspace.manage' })) {
      return reply.code(403).send({ code: 'agent_bridge_forbidden' });
    }
    if (!options.approvalService) {
      return reply.code(503).send({ code: 'agent_bridge_approval_unavailable' });
    }

    const status = await options.approvalService.rotationStatus(session.activeWorkspaceId);
    return {
      version: 'kcc.agent-bridge-approval-rotation.v1',
      status,
    };
  });

  app.post('/v1/products/agent-bridge/approval-keys/rotate', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const session = await operatorSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ code: 'unauthorized' });
    if (!session.activeWorkspaceId) return reply.code(400).send({ code: 'workspace_required' });
    if (!authorize(session, { product: 'agent-bridge', capability: 'workspace.manage' })) {
      return reply.code(403).send({ code: 'agent_bridge_forbidden' });
    }
    if (!options.approvalService) {
      return reply.code(503).send({ code: 'agent_bridge_approval_unavailable' });
    }

    const status = await options.approvalService.beginRotation(session.activeWorkspaceId);
    return reply.code(202).send({
      version: 'kcc.agent-bridge-approval-rotation.v1',
      status,
    });
  });

  app.post('/api/products/agent-bridge/approval-keys/sync', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const session = await runtimeSession(request, options.controlStore);
    if (!session) return reply.code(401).send({ code: 'invalid_runtime_session' });
    if (!options.approvalService) {
      return reply.code(503).send({ code: 'agent_bridge_approval_unavailable' });
    }
    const body = object(request.body);
    const sessionId = text(body?.sessionId);
    const currentGeneration = body?.currentGeneration;
    if (
      !sessionId ||
      sessionId !== session.sessionId ||
      !Number.isInteger(currentGeneration) ||
      Number(currentGeneration) < 0
    ) {
      return reply.code(400).send({ code: 'invalid_approval_key_sync_request' });
    }
    const reportedGeneration = Number(currentGeneration);
    const platformGeneration = await options.approvalService.generation(session.tenantId);
    if (reportedGeneration > platformGeneration) {
      return reply.code(409).send({
        code: 'approval_key_generation_ahead',
        currentGeneration: platformGeneration,
      });
    }

    try {
      const result = await options.approvalService.syncApprovalKeys({
        tenantId: session.tenantId,
        installationId: session.installationId,
        bridgeInstanceId: session.bridgeInstanceId,
        currentGeneration: reportedGeneration,
      });
      if (!result.update) return reply.code(204).send();
      return { update: result.update };
    } catch (error) {
      request.log.warn({ err: error }, 'Agent Bridge approval-key synchronization rejected');
      if (error instanceof Error && error.message === 'agent_bridge_approval_generation_ahead') {
        return reply.code(409).send({ code: 'approval_key_generation_ahead' });
      }
      return reply.code(409).send({ code: 'approval_key_sync_rejected' });
    }
  });

  app.post('/api/products/agent-bridge/audit/batch', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const session = await runtimeSession(request, options.controlStore);
    if (!session) return reply.code(401).send({ code: 'invalid_runtime_session' });
    if (!options.auditStore) {
      return reply.code(503).send({ code: 'agent_bridge_audit_unavailable' });
    }
    const body = object(request.body);
    const batch = auditBatch(body?.batch);
    if (!batch) return reply.code(400).send({ code: 'invalid_agent_bridge_audit_batch' });

    try {
      const acceptedEventIds = await options.auditStore.ingestBatch(session, batch);
      return {
        ack: {
          version: 'kab.audit-batch-ack.v1',
          batchId: batch.batchId,
          acceptedEventIds,
        },
      };
    } catch (error) {
      request.log.warn({ err: error }, 'Agent Bridge audit batch rejected');
      return reply.code(409).send({ code: 'agent_bridge_audit_batch_rejected' });
    }
  });
}
