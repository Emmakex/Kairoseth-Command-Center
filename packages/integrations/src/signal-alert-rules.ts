import type { IntegrationSignal, IntegrationSignalType } from './index.js';

export type DerivedAlertSeverity = 'info' | 'warning' | 'urgent' | 'critical';

export type DerivedSignalAlert = {
  ruleId: string;
  fingerprint: string;
  title: string;
  message?: string;
  severity: DerivedAlertSeverity;
  signalId: string;
  signalType: IntegrationSignalType;
  occurredAt: string;
  projectId?: string;
};

const FAILURE_CONCLUSIONS = new Set(['failure', 'timed_out', 'startup_failure']);
const ATTENTION_CONCLUSIONS = new Set(['action_required']);

function payloadText(payload: Record<string, unknown>, key: string, maxLength = 300): string | undefined {
  const value = payload[key];
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : undefined;
}

function ciAlert(signal: IntegrationSignal): DerivedSignalAlert | null {
  if (signal.type !== 'repository.ci') return null;
  const conclusion = payloadText(signal.payload, 'conclusion', 80)?.toLowerCase();
  if (!conclusion) return null;

  const failed = FAILURE_CONCLUSIONS.has(conclusion);
  const attentionRequired = ATTENTION_CONCLUSIONS.has(conclusion);
  if (!failed && !attentionRequired) return null;

  const name = payloadText(signal.payload, 'name', 160) ?? 'CI';
  const repository = payloadText(signal.payload, 'repository', 300);
  const branch = payloadText(signal.payload, 'headBranch', 200);
  const projectId = payloadText(signal.payload, 'projectId', 200);
  const details = [repository, branch, conclusion].filter(Boolean).join(' · ');
  const ruleId = failed ? 'repository.ci.failed.v1' : 'repository.ci.action_required.v1';

  return {
    ruleId,
    fingerprint: `integration-rule:${ruleId}:${signal.id}`,
    title: `CI · ${name}`,
    ...(details ? { message: details } : {}),
    severity: failed ? 'urgent' : 'warning',
    signalId: signal.id,
    signalType: signal.type,
    occurredAt: signal.occurredAt,
    ...(projectId ? { projectId } : {}),
  };
}

export function deriveAlertsFromIntegrationSignal(signal: IntegrationSignal): DerivedSignalAlert[] {
  const candidates = [ciAlert(signal)];
  return candidates.filter((candidate): candidate is DerivedSignalAlert => candidate !== null);
}

export function deriveAlertsFromIntegrationSignals(signals: IntegrationSignal[]): DerivedSignalAlert[] {
  return signals.flatMap(deriveAlertsFromIntegrationSignal);
}
