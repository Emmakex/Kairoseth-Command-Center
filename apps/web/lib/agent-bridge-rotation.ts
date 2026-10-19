export type AgentBridgeApprovalRotationStatus = {
  generation: number;
  phase: 'stable' | 'overlap' | 'retiring';
  signingKeyId: string;
  trustedKeyIds: string[];
};

type AgentBridgeApprovalRotationResponse = {
  version: 'kcc.agent-bridge-approval-rotation.v1';
  status: AgentBridgeApprovalRotationStatus;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function parseAgentBridgeApprovalRotationResponse(
  value: unknown,
): AgentBridgeApprovalRotationResponse | null {
  const body = record(value);
  const status = record(body?.status);
  if (body?.version !== 'kcc.agent-bridge-approval-rotation.v1' || !status) return null;

  const generation = status.generation;
  const phase = status.phase;
  const signingKeyId = nonEmptyText(status.signingKeyId);
  const trustedKeyIds = Array.isArray(status.trustedKeyIds)
    ? status.trustedKeyIds.map(nonEmptyText)
    : null;

  if (
    !Number.isInteger(generation) ||
    Number(generation) < 0 ||
    !['stable', 'overlap', 'retiring'].includes(String(phase)) ||
    !signingKeyId ||
    !trustedKeyIds ||
    trustedKeyIds.length === 0 ||
    trustedKeyIds.some((keyId) => keyId === null)
  ) {
    return null;
  }

  return {
    version: 'kcc.agent-bridge-approval-rotation.v1',
    status: {
      generation: Number(generation),
      phase: phase as AgentBridgeApprovalRotationStatus['phase'],
      signingKeyId,
      trustedKeyIds: trustedKeyIds as string[],
    },
  };
}
