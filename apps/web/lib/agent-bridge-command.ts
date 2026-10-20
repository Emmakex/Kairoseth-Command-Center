export type AgentBridgeOperatorCommand = {
  commandId: string;
  installationId: string;
  toolId: string;
  state: 'queued' | 'delivered' | 'completed';
  issuedAt: string;
  expiresAt: string;
  deliveryAttempt: number;
  acknowledgement?: {
    status:
      | 'executed'
      | 'approval_required'
      | 'denied'
      | 'failed'
      | 'rejected'
      | 'expired'
      | 'duplicate'
      | 'indeterminate';
    completedAt: string;
    reason?: string;
    output?: unknown;
  };
};

type AgentBridgeCommandResponse = {
  version: 'kcc.agent-bridge-command.v1';
  command: AgentBridgeOperatorCommand;
};

const STATES = new Set(['queued', 'delivered', 'completed']);
const ACK_STATUSES = new Set([
  'executed',
  'approval_required',
  'denied',
  'failed',
  'rejected',
  'expired',
  'duplicate',
  'indeterminate',
]);
const SECRET_KEY = /(?:token|secret|password|credential|authorization|cookie|session[_-]?id|runtime[_-]?session|action[_-]?fingerprint|public[_-]?key|private[_-]?key|key[_-]?id|api[_-]?key|access[_-]?key)/i;
const SECRET_ASSIGNMENT = /\b(token|secret|password|credential|authorization|cookie|session[_-]?id|runtime[_-]?session|action[_-]?fingerprint|public[_-]?key|private[_-]?key|key[_-]?id|api[_-]?key|access[_-]?key)\b\s*[:=]\s*([^\s,;]+)/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const KEY_MATERIAL = /-----BEGIN(?: [A-Z0-9]+)? (?:PUBLIC|PRIVATE) KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? (?:PUBLIC|PRIVATE) KEY-----/gi;
const MAX_OUTPUT_DEPTH = 6;
const MAX_OUTPUT_ITEMS = 50;
const MAX_OUTPUT_TEXT = 2048;

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
    if (code <= 31 && ![9, 10, 13].includes(code)) return null;
    if (code === 127) return null;
  }
  return normalized;
}

function timestamp(value: unknown): string | null {
  const parsed = safeText(value, 64);
  return parsed && Number.isFinite(Date.parse(parsed)) ? parsed : null;
}

export function sanitizeAgentBridgeText(value: string, max = MAX_OUTPUT_TEXT): string {
  const redacted = value
    .replace(KEY_MATERIAL, '[redacted-key-material]')
    .replace(BEARER, 'Bearer [redacted]')
    .replace(SECRET_ASSIGNMENT, '$1=[redacted]');
  return redacted.length > max ? `${redacted.slice(0, max)}…` : redacted;
}

export function sanitizeAgentBridgeOutput(value: unknown, depth = 0): unknown {
  if (depth > MAX_OUTPUT_DEPTH) return '[truncated]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return sanitizeAgentBridgeText(value);
  if (Array.isArray(value)) {
    const projected = value
      .slice(0, MAX_OUTPUT_ITEMS)
      .map((item) => sanitizeAgentBridgeOutput(item, depth + 1));
    if (value.length > MAX_OUTPUT_ITEMS) projected.push('[truncated]');
    return projected;
  }
  const body = record(value);
  if (!body) return '[unsupported]';

  const entries = Object.entries(body).slice(0, MAX_OUTPUT_ITEMS);
  const projected: Record<string, unknown> = {};
  for (const [key, item] of entries) {
    projected[key] = SECRET_KEY.test(key)
      ? '[redacted]'
      : sanitizeAgentBridgeOutput(item, depth + 1);
  }
  if (Object.keys(body).length > MAX_OUTPUT_ITEMS) projected.__truncated__ = true;
  return projected;
}

export function parseAgentBridgeCommandResponse(value: unknown): AgentBridgeCommandResponse | null {
  const body = record(value);
  const command = record(body?.command);
  if (body?.version !== 'kcc.agent-bridge-command.v1' || !command) return null;

  const commandId = safeText(command.commandId, 512);
  const installationId = safeText(command.installationId, 512);
  const toolId = safeText(command.toolId, 512);
  const issuedAt = timestamp(command.issuedAt);
  const expiresAt = timestamp(command.expiresAt);
  const state = command.state;
  const deliveryAttempt = command.deliveryAttempt;
  if (
    !commandId ||
    !installationId ||
    !toolId ||
    !issuedAt ||
    !expiresAt ||
    !STATES.has(String(state)) ||
    !Number.isInteger(deliveryAttempt) ||
    Number(deliveryAttempt) < 0
  ) {
    return null;
  }

  const hasAcknowledgement = command.acknowledgement !== undefined;
  if ((state === 'completed') !== hasAcknowledgement) return null;

  let acknowledgement: AgentBridgeOperatorCommand['acknowledgement'];
  if (hasAcknowledgement) {
    const ack = record(command.acknowledgement);
    const status = ack?.status;
    const completedAt = timestamp(ack?.completedAt);
    const rawReason = ack?.reason === undefined ? undefined : safeText(ack.reason, 4096);
    if (
      !ack ||
      !ACK_STATUSES.has(String(status)) ||
      !completedAt ||
      (ack.reason !== undefined && !rawReason)
    ) {
      return null;
    }
    acknowledgement = {
      status: status as NonNullable<AgentBridgeOperatorCommand['acknowledgement']>['status'],
      completedAt,
      ...(rawReason ? { reason: sanitizeAgentBridgeText(rawReason, 4096) } : {}),
      ...(Object.prototype.hasOwnProperty.call(ack, 'output')
        ? { output: sanitizeAgentBridgeOutput(ack.output) }
        : {}),
    };
  }

  return {
    version: 'kcc.agent-bridge-command.v1',
    command: {
      commandId,
      installationId,
      toolId,
      state: state as AgentBridgeOperatorCommand['state'],
      issuedAt,
      expiresAt,
      deliveryAttempt: Number(deliveryAttempt),
      ...(acknowledgement ? { acknowledgement } : {}),
    },
  };
}
