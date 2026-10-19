import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AgentBridgeApprovalService } from './agent-bridge-approval-service';
import type { AgentBridgeAuditEvent, AgentBridgeAuditStore } from './agent-bridge-audit-store';
import type {
  AgentBridgeControlStore,
  AgentBridgeRuntimeSession,
} from './agent-bridge-control-store';

const MAX_AUDIT_BATCH_SIZE = 500;
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_MESSAGE_LENGTH = 512;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const SECRET_PATTERNS: readonly RegExp[] = [
  /kab1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /kabd1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /Bearer\s+[A-Za-z0-9._~+\/-]+/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|authorization)\b\s*[:=]\s*[^\s,;]+/gi,
];

export function registerAgentBridgeSecurityRoutes(
  app: FastifyInstance,
  options: {
    controlStore?: AgentBridgeControlStore;
    auditStore?: AgentBridgeAuditStore;
    approvalService?: AgentBridgeApprovalService;
  },
): void {
  app.post('/api/products/agent-bridge/approval-keys/sync', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const session = await runtimeSession(request, options.controlStore);
    if (!session) return reply.code(401).send({ code: 'invalid_runtime_session' });

    const body = object(request.body);
    const sessionId = text(body?.sessionId, 160);
    const currentGeneration = body?.currentGeneration;
    if (
      !sessionId ||
      sessionId !== session.sessionId ||
      !Number.isInteger(currentGeneration) ||
      Number(currentGeneration) < 0
    ) {
      return reply.code(400).send({ code: 'invalid_approval_key_sync_request' });
    }

    // Generation 0 is bootstrapped in the signed installation binding. Static-key
    // deployments have no newer generation to send; rotation can advance this protocol later.
    return reply.code(204).send();
  });

  app.post('/api/products/agent-bridge/audit/batch', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const session = await runtimeSession(request, options.controlStore);
    if (!session) return reply.code(401).send({ code: 'invalid_runtime_session' });
    if (!options.auditStore) {
      return reply.code(503).send({ code: 'agent_bridge_audit_unavailable' });
    }

    const body = object(request.body);
    const batch = auditBatch(body?.batch, session);
    if (!batch) return reply.code(400).send({ code: 'invalid_audit_batch' });

    try {
      const acceptedEventIds = await options.auditStore.ingestEvents(session, batch.events);
      return {
        ack: {
          version: 'kab.audit-batch-ack.v1' as const,
          batchId: batch.batchId,
          acceptedEventIds,
        },
      };
    } catch {
      return reply.code(409).send({ code: 'agent_bridge_audit_conflict' });
    }
  });
}

type ParsedAuditBatch = {
  batchId: string;
  events: AgentBridgeAuditEvent[];
};

function auditBatch(value: unknown, session: AgentBridgeRuntimeSession): ParsedAuditBatch | null {
  const batch = object(value);
  if (!batch || batch.version !== 'kab.audit-batch.v1' || !Array.isArray(batch.events)) {
    return null;
  }
  if (batch.events.length < 1 || batch.events.length > MAX_AUDIT_BATCH_SIZE) return null;

  const batchId = text(batch.batchId, 160);
  const sessionId = text(batch.sessionId, 160);
  const tenantId = text(batch.tenantId);
  const installationId = text(batch.installationId);
  const bridgeInstanceId = text(batch.bridgeInstanceId);
  if (
    !batchId ||
    sessionId !== session.sessionId ||
    tenantId !== session.tenantId ||
    installationId !== session.installationId ||
    bridgeInstanceId !== session.bridgeInstanceId
  ) {
    return null;
  }

  const events: AgentBridgeAuditEvent[] = [];
  const eventIds = new Set<string>();
  for (const candidate of batch.events) {
    const event = auditEvent(candidate, session);
    if (!event || eventIds.has(event.eventId)) return null;
    eventIds.add(event.eventId);
    events.push(event);
  }
  return { batchId, events };
}

function auditEvent(
  value: unknown,
  session: AgentBridgeRuntimeSession,
): AgentBridgeAuditEvent | null {
  const event = object(value);
  if (!event || event.version !== 'kab.audit-event.v1') return null;
  if (!onlyKeys(event, [
    'version', 'eventId', 'tenantId', 'installationId', 'bridgeInstanceId', 'type',
    'correlationId', 'toolId', 'actor', 'risk', 'occurredAt', 'outcome', 'message', 'provenance',
  ])) return null;

  const eventId = text(event.eventId, 160);
  const tenantId = text(event.tenantId);
  const installationId = text(event.installationId);
  const bridgeInstanceId = text(event.bridgeInstanceId);
  const correlationId = text(event.correlationId);
  const toolId = text(event.toolId);
  const actor = text(event.actor);
  const occurredAt = timestamp(event.occurredAt);
  const type = event.type;
  const risk = event.risk;
  const outcome = event.outcome;
  if (
    !eventId ||
    tenantId !== session.tenantId ||
    installationId !== session.installationId ||
    bridgeInstanceId !== session.bridgeInstanceId ||
    !correlationId ||
    !toolId ||
    !actor ||
    !occurredAt ||
    ![
      'INVOCATION_RECEIVED',
      'POLICY_EVALUATED',
      'EXECUTION_STARTED',
      'EXECUTION_SUCCEEDED',
      'EXECUTION_FAILED',
    ].includes(String(type)) ||
    !['READ', 'WRITE', 'CRITICAL'].includes(String(risk)) ||
    (outcome !== undefined && !['ALLOW', 'DENY', 'REQUIRE_APPROVAL'].includes(String(outcome)))
  ) {
    return null;
  }

  const message = event.message === undefined ? undefined : auditMessage(event.message);
  if (event.message !== undefined && message === null) return null;
  const provenance = event.provenance === undefined ? undefined : auditProvenance(event.provenance);
  if (event.provenance !== undefined && !provenance) return null;

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
    ...(provenance ? { provenance } : {}),
  };
}

function auditProvenance(value: unknown): NonNullable<AgentBridgeAuditEvent['provenance']> | null {
  const provenance = object(value);
  if (
    !provenance ||
    provenance.version !== 'kab.provenance.v1' ||
    !onlyKeys(provenance, ['version', 'protocol', 'rootCorrelationId', 'parentCorrelationId', 'principal'])
  ) {
    return null;
  }
  const protocol = provenance.protocol;
  const rootCorrelationId = text(provenance.rootCorrelationId);
  const parentCorrelationId =
    provenance.parentCorrelationId === undefined ? undefined : text(provenance.parentCorrelationId);
  if (
    !['kairoseth-native', 'mcp', 'a2a', 'rest', 'webhook', 'internal'].includes(String(protocol)) ||
    !rootCorrelationId ||
    (provenance.parentCorrelationId !== undefined && !parentCorrelationId)
  ) {
    return null;
  }

  const principal = provenance.principal === undefined ? undefined : auditPrincipal(provenance.principal);
  if (provenance.principal !== undefined && !principal) return null;
  return {
    version: 'kab.provenance.v1',
    protocol: protocol as NonNullable<AgentBridgeAuditEvent['provenance']>['protocol'],
    rootCorrelationId,
    ...(parentCorrelationId ? { parentCorrelationId } : {}),
    ...(principal ? { principal } : {}),
  };
}

function auditPrincipal(
  value: unknown,
): NonNullable<NonNullable<AgentBridgeAuditEvent['provenance']>['principal']> | null {
  const principal = object(value);
  if (!principal || !onlyKeys(principal, ['issuer', 'subject', 'authenticationMethod', 'clientId'])) {
    return null;
  }
  const issuer = text(principal.issuer);
  const subject = text(principal.subject);
  const authenticationMethod = text(principal.authenticationMethod);
  const clientId = principal.clientId === undefined ? undefined : text(principal.clientId);
  if (!issuer || !subject || !authenticationMethod || (principal.clientId !== undefined && !clientId)) {
    return null;
  }
  return {
    issuer,
    subject,
    authenticationMethod,
    ...(clientId ? { clientId } : {}),
  };
}

async function runtimeSession(
  request: FastifyRequest,
  store?: AgentBridgeControlStore,
): Promise<AgentBridgeRuntimeSession | null> {
  const token = bearer(request);
  return token && store ? store.resolveRuntimeSession(token) : null;
}

function bearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

function object(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, max = MAX_IDENTIFIER_LENGTH): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[\r\n\t]/g, ' ').trim();
  return normalized && normalized.length <= max ? normalized : null;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed > Date.now() + MAX_CLOCK_SKEW_MS) return null;
  return new Date(parsed).toISOString();
}

function auditMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let sanitized = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, (_match, secretName?: string) =>
      typeof secretName === 'string' && secretName.length > 0
        ? `${secretName}=[REDACTED]`
        : '[REDACTED]',
    );
  }
  return sanitized.slice(0, MAX_MESSAGE_LENGTH);
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const set = new Set(allowed);
  return Object.keys(value).every((key) => set.has(key));
}
