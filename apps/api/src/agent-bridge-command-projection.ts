import type {
  AgentBridgeCommandAcknowledgement,
  AgentBridgeQueuedCommand,
} from './agent-bridge-execution-store';

const SECRET_KEY = /(?:token|secret|password|credential|authorization|cookie|session[_-]?id|runtime[_-]?session|action[_-]?fingerprint|public[_-]?key|private[_-]?key|key[_-]?id|api[_-]?key|access[_-]?key)/i;
const SECRET_ASSIGNMENT = /\b(token|secret|password|credential|authorization|cookie|session[_-]?id|runtime[_-]?session|action[_-]?fingerprint|public[_-]?key|private[_-]?key|key[_-]?id|api[_-]?key|access[_-]?key)\b\s*[:=]\s*([^\s,;]+)/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const KEY_MATERIAL = /-----BEGIN(?: [A-Z0-9]+)? (?:PUBLIC|PRIVATE) KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? (?:PUBLIC|PRIVATE) KEY-----/gi;
const MAX_OUTPUT_DEPTH = 6;
const MAX_OUTPUT_ITEMS = 50;
const MAX_OUTPUT_TEXT = 2048;
const MAX_REASON_TEXT = 4096;

export type AgentBridgeOperatorAcknowledgement = Omit<
  AgentBridgeCommandAcknowledgement,
  'sessionId' | 'reason' | 'output'
> & {
  reason?: string;
  output?: unknown;
};

export type AgentBridgeOperatorCommand = Omit<AgentBridgeQueuedCommand, 'acknowledgement'> & {
  acknowledgement?: AgentBridgeOperatorAcknowledgement;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function sanitizeAgentBridgeOperatorText(
  value: string,
  max = MAX_OUTPUT_TEXT,
): string {
  const redacted = value
    .replace(KEY_MATERIAL, '[redacted-key-material]')
    .replace(BEARER, 'Bearer [redacted]')
    .replace(SECRET_ASSIGNMENT, '$1=[redacted]');
  return redacted.length > max ? `${redacted.slice(0, max)}…` : redacted;
}

export function sanitizeAgentBridgeOperatorOutput(value: unknown, depth = 0): unknown {
  if (depth > MAX_OUTPUT_DEPTH) return '[truncated]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return sanitizeAgentBridgeOperatorText(value);
  if (Array.isArray(value)) {
    const projected = value
      .slice(0, MAX_OUTPUT_ITEMS)
      .map((item) => sanitizeAgentBridgeOperatorOutput(item, depth + 1));
    if (value.length > MAX_OUTPUT_ITEMS) projected.push('[truncated]');
    return projected;
  }

  const body = record(value);
  if (!body) return '[unsupported]';
  const projected: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(body).slice(0, MAX_OUTPUT_ITEMS)) {
    projected[key] = SECRET_KEY.test(key)
      ? '[redacted]'
      : sanitizeAgentBridgeOperatorOutput(item, depth + 1);
  }
  if (Object.keys(body).length > MAX_OUTPUT_ITEMS) projected.__truncated__ = true;
  return projected;
}

function projectAcknowledgement(
  acknowledgement: AgentBridgeCommandAcknowledgement,
): AgentBridgeOperatorAcknowledgement {
  return {
    version: acknowledgement.version,
    commandId: acknowledgement.commandId,
    deliveryAttempt: acknowledgement.deliveryAttempt,
    correlationId: acknowledgement.correlationId,
    status: acknowledgement.status,
    completedAt: acknowledgement.completedAt,
    ...(acknowledgement.originalOutcome
      ? { originalOutcome: acknowledgement.originalOutcome }
      : {}),
    ...(acknowledgement.reason
      ? {
          reason: sanitizeAgentBridgeOperatorText(
            acknowledgement.reason,
            MAX_REASON_TEXT,
          ),
        }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(acknowledgement, 'output')
      ? { output: sanitizeAgentBridgeOperatorOutput(acknowledgement.output) }
      : {}),
  };
}

export function projectAgentBridgeOperatorCommand(
  command: AgentBridgeQueuedCommand,
): AgentBridgeOperatorCommand {
  return {
    commandId: command.commandId,
    correlationId: command.correlationId,
    installationId: command.installationId,
    toolId: command.toolId,
    state: command.state,
    issuedAt: command.issuedAt,
    expiresAt: command.expiresAt,
    deliveryAttempt: command.deliveryAttempt,
    ...(command.acknowledgement
      ? { acknowledgement: projectAcknowledgement(command.acknowledgement) }
      : {}),
  };
}
