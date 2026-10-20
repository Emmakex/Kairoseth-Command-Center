import type {
  AgentBridgeOperatorTool,
  AgentBridgeToolInventory,
} from './agent-bridge-tools';

const MAX_INPUT_BYTES = 64 * 1024;

export type AgentBridgeExecutionPlan = {
  tool: AgentBridgeOperatorTool;
  endpointKind: 'read' | 'approved';
  input: unknown;
};

export type AgentBridgeExecutionPlanError =
  | 'tool_not_found'
  | 'tool_blocked'
  | 'invalid_input'
  | 'input_too_large';

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function planAgentBridgeExecution(
  inventory: AgentBridgeToolInventory,
  executionToolId: string,
  rawInput: string,
): { plan: AgentBridgeExecutionPlan } | { error: AgentBridgeExecutionPlanError } {
  const tool = inventory.tools.find((candidate) => candidate.executionToolId === executionToolId);
  if (!tool) return { error: 'tool_not_found' };
  if (tool.availability !== 'available') return { error: 'tool_blocked' };

  const normalized = rawInput.trim() || '{}';
  if (byteLength(normalized) > MAX_INPUT_BYTES) return { error: 'input_too_large' };

  let input: unknown;
  try {
    input = JSON.parse(normalized) as unknown;
  } catch {
    return { error: 'invalid_input' };
  }

  return {
    plan: {
      tool,
      endpointKind: tool.risk === 'READ' ? 'read' : 'approved',
      input,
    },
  };
}
