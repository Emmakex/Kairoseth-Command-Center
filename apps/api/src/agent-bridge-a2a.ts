import { isDeepStrictEqual } from 'node:util';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize } from '@kcc/auth';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import {
  AGENT_BRIDGE_A2A_TASK_STATES,
  type AgentBridgeA2AScope,
  type AgentBridgeA2AStore,
  type AgentBridgeA2AStoredTask,
  type AgentBridgeA2ATaskState,
  type AgentBridgeA2ATransitionClaim,
} from './agent-bridge-a2a-store';

const MAX_IDENTIFIER_LENGTH = 512;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/i;

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

function identifier(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > MAX_IDENTIFIER_LENGTH ||
    hasControlCharacters(normalized)
  ) {
    return null;
  }
  return normalized;
}

function taskState(value: unknown): AgentBridgeA2ATaskState | null {
  return typeof value === 'string' &&
    (AGENT_BRIDGE_A2A_TASK_STATES as readonly string[]).includes(value)
    ? (value as AgentBridgeA2ATaskState)
    : null;
}

function scope(value: unknown): AgentBridgeA2AScope | null {
  if (!isPlainObject(value)) return null;
  const actor = identifier(value.actor);
  const tenantId = identifier(value.tenantId);
  const installationId = identifier(value.installationId);
  return actor && tenantId && installationId ? { actor, tenantId, installationId } : null;
}

function sameScope(left: AgentBridgeA2AScope, right: AgentBridgeA2AScope): boolean {
  return (
    left.actor === right.actor &&
    left.tenantId === right.tenantId &&
    left.installationId === right.installationId
  );
}

function storedTask(value: unknown): AgentBridgeA2AStoredTask | null {
  if (!isPlainObject(value)) return null;
  if (!isPlainObject(value.task) || !isPlainObject(value.task.status)) return null;
  if (!isPlainObject(value.invocation)) return null;

  const id = identifier(value.task.id);
  const state = taskState(value.task.status.state);
  const parsedScope = scope(value.scope);
  const toolId = identifier(value.invocation.toolId);
  const correlationId = identifier(value.invocation.correlationId);
  const actionFingerprint =
    typeof value.invocation.actionFingerprint === 'string' &&
    FINGERPRINT_PATTERN.test(value.invocation.actionFingerprint)
      ? value.invocation.actionFingerprint
      : null;

  if (
    !id ||
    !state ||
    !parsedScope ||
    !toolId ||
    !correlationId ||
    !actionFingerprint ||
    !Object.prototype.hasOwnProperty.call(value.invocation, 'input')
  ) {
    return null;
  }

  return structuredClone(value) as AgentBridgeA2AStoredTask;
}

function transitionClaim(value: unknown): AgentBridgeA2ATransitionClaim | null {
  if (!isPlainObject(value)) return null;
  const claimId = identifier(value.claimId);
  const record = storedTask(value.record);
  return claimId && record ? { claimId, record } : null;
}

function tenantAllowed(session: SessionContext, requestedScope: AgentBridgeA2AScope): boolean {
  return Boolean(session.activeWorkspaceId) && requestedScope.tenantId === session.activeWorkspaceId;
}

function hasAgentBridgeAccess(session: SessionContext): boolean {
  return authorize(session, { product: 'agent-bridge' });
}

function bodyOf(request: FastifyRequest): Record<string, unknown> {
  return isPlainObject(request.body) ? request.body : {};
}

export function registerAgentBridgeA2ARoutes(
  app: FastifyInstance,
  options: {
    authProvider?: AuthProvider;
    agentBridgeA2AStore?: AgentBridgeA2AStore;
  },
): void {
  const authenticate = async (request: FastifyRequest) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return { session: null, code: 401 as const, error: 'unauthorized' };
    if (!session.activeWorkspaceId) {
      return { session: null, code: 400 as const, error: 'workspace_required' };
    }
    if (!hasAgentBridgeAccess(session)) {
      return { session: null, code: 403 as const, error: 'agent_bridge_forbidden' };
    }
    return { session, code: 200 as const, error: null };
  };

  app.post('/api/products/agent-bridge/a2a/tasks/save', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const auth = await authenticate(request);
    if (!auth.session) return reply.code(auth.code).send({ code: auth.error });
    if (!options.agentBridgeA2AStore) {
      return reply.code(503).send({ code: 'platform_a2a_store_unavailable' });
    }

    const body = bodyOf(request);
    if (body.version !== 'kab.a2a-task-save.v1') {
      return reply.code(400).send({ code: 'invalid_a2a_save_version' });
    }
    const record = storedTask(body.record);
    if (!record) return reply.code(400).send({ code: 'invalid_a2a_task_record' });
    if (!tenantAllowed(auth.session, record.scope)) {
      return reply.code(403).send({ code: 'tenant_scope_mismatch' });
    }

    const result = await options.agentBridgeA2AStore.save(record);
    if (!result.ok) return reply.code(409).send({ code: result.code });
    return { saved: true };
  });

  app.post('/api/products/agent-bridge/a2a/tasks/get', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const auth = await authenticate(request);
    if (!auth.session) return reply.code(auth.code).send({ code: auth.error });
    if (!options.agentBridgeA2AStore) {
      return reply.code(503).send({ code: 'platform_a2a_store_unavailable' });
    }

    const body = bodyOf(request);
    if (body.version !== 'kab.a2a-task-get.v1') {
      return reply.code(400).send({ code: 'invalid_a2a_get_version' });
    }
    const taskId = identifier(body.taskId);
    const requestedScope = scope(body.scope);
    if (!taskId || !requestedScope) {
      return reply.code(400).send({ code: 'invalid_a2a_get_request' });
    }
    if (!tenantAllowed(auth.session, requestedScope)) {
      return reply.code(403).send({ code: 'tenant_scope_mismatch' });
    }

    return { record: await options.agentBridgeA2AStore.get(taskId, requestedScope) };
  });

  app.post('/api/products/agent-bridge/a2a/tasks/claim', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const auth = await authenticate(request);
    if (!auth.session) return reply.code(auth.code).send({ code: auth.error });
    if (!options.agentBridgeA2AStore) {
      return reply.code(503).send({ code: 'platform_a2a_store_unavailable' });
    }

    const body = bodyOf(request);
    if (body.version !== 'kab.a2a-task-claim.v1') {
      return reply.code(400).send({ code: 'invalid_a2a_claim_version' });
    }
    const taskId = identifier(body.taskId);
    const requestedScope = scope(body.scope);
    const expectedState = taskState(body.expectedState);
    const expectedActionFingerprint =
      typeof body.expectedActionFingerprint === 'string' &&
      FINGERPRINT_PATTERN.test(body.expectedActionFingerprint)
        ? body.expectedActionFingerprint
        : null;
    const claimId = identifier(body.claimId);
    if (
      !taskId ||
      !requestedScope ||
      !expectedState ||
      !expectedActionFingerprint ||
      !claimId
    ) {
      return reply.code(400).send({ code: 'invalid_a2a_claim_request' });
    }
    if (!tenantAllowed(auth.session, requestedScope)) {
      return reply.code(403).send({ code: 'tenant_scope_mismatch' });
    }

    return {
      claim: await options.agentBridgeA2AStore.claim({
        taskId,
        scope: requestedScope,
        expectedState,
        expectedActionFingerprint,
        claimId,
      }),
    };
  });

  app.post('/api/products/agent-bridge/a2a/tasks/complete', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const auth = await authenticate(request);
    if (!auth.session) return reply.code(auth.code).send({ code: auth.error });
    if (!options.agentBridgeA2AStore) {
      return reply.code(503).send({ code: 'platform_a2a_store_unavailable' });
    }

    const body = bodyOf(request);
    if (body.version !== 'kab.a2a-task-complete.v1') {
      return reply.code(400).send({ code: 'invalid_a2a_complete_version' });
    }
    const claim = transitionClaim(body.claim);
    const record = storedTask(body.record);
    if (!claim || !record) {
      return reply.code(400).send({ code: 'invalid_a2a_complete_request' });
    }
    if (
      claim.record.task.id !== record.task.id ||
      !sameScope(claim.record.scope, record.scope) ||
      !isDeepStrictEqual(claim.record.invocation, record.invocation)
    ) {
      return reply.code(400).send({ code: 'a2a_transition_binding_mismatch' });
    }
    if (!tenantAllowed(auth.session, record.scope)) {
      return reply.code(403).send({ code: 'tenant_scope_mismatch' });
    }

    return { completed: await options.agentBridgeA2AStore.complete(claim, record) };
  });
}
