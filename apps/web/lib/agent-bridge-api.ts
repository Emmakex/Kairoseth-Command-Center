import { apiBaseUrl } from './api';

export type AgentBridgeRuntimeToolHealthSummary = {
  toolId: string;
  runtimeToolId: string;
  availability: 'available' | 'degraded' | 'blocked';
  blockedReason?: 'circuit_open' | 'credential_rotation';
};

export type AgentBridgeRuntimeConnectorSummary = {
  connectorId: string;
  connectorInstanceId: string;
  name: string;
  version: string;
  localizations: Partial<Record<'es' | 'en', { name: string; description: string }>> | null;
  health: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    checkedAt: string;
    tools: AgentBridgeRuntimeToolHealthSummary[];
  } | null;
};

export type AgentBridgeRuntimeSummary = {
  installationId: string;
  bridgeInstanceId: string;
  snapshotId: string;
  generatedAt: string;
  receivedAt: string;
  freshness: 'online' | 'stale' | 'offline';
  connectorCount: number;
  toolCount: number;
  degradedConnectorCount: number;
  blockedToolCount: number;
  connectors: AgentBridgeRuntimeConnectorSummary[];
};

export async function getAgentBridgeRuntimes(
  token: string,
): Promise<AgentBridgeRuntimeSummary[] | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/api/products/agent-bridge/runtimes`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { runtimes?: unknown };
    return Array.isArray(payload.runtimes)
      ? (payload.runtimes as AgentBridgeRuntimeSummary[])
      : null;
  } catch {
    return null;
  }
}
