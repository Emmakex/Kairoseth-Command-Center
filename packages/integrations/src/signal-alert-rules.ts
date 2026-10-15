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

export type DerivedSignalAlertResolution = {
  ruleId: string;
  fingerprint: string;
  causeSignalId: string;
  signalType: IntegrationSignalType;
  occurredAt: string;
};

export type DerivedSignalAlertReconciliation = {
  active: DerivedSignalAlert[];
  resolve: DerivedSignalAlertResolution[];
};

const FAILURE_CONCLUSIONS = new Set(['failure', 'timed_out', 'startup_failure']);
const ATTENTION_CONCLUSIONS = new Set(['action_required']);
const HEALTHY_CONCLUSIONS = new Set(['success']);
const CI_ALERT_RULE_IDS = ['repository.ci.failed.v1', 'repository.ci.action_required.v1'] as const;

type CiAlertRuleId = (typeof CI_ALERT_RULE_IDS)[number];

function payloadText(payload: Record<string, unknown>, key: string, maxLength = 300): string | undefined {
  const value = payload[key];
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : undefined;
}

function ciConclusion(signal: IntegrationSignal): string | undefined {
  if (signal.type !== 'repository.ci') return undefined;
  return payloadText(signal.payload, 'conclusion', 80)?.toLowerCase();
}

function ciAlertFingerprint(ruleId: CiAlertRuleId, signalId: string): string {
  return `integration-rule:${ruleId}:${signalId}`;
}

function ciAlert(signal: IntegrationSignal): DerivedSignalAlert | null {
  if (signal.type !== 'repository.ci') return null;
  const conclusion = ciConclusion(signal);
  if (!conclusion) return null;

  const failed = FAILURE_CONCLUSIONS.has(conclusion);
  const attentionRequired = ATTENTION_CONCLUSIONS.has(conclusion);
  if (!failed && !attentionRequired) return null;

  const name = payloadText(signal.payload, 'name', 160) ?? 'CI';
  const repository = payloadText(signal.payload, 'repository', 300);
  const branch = payloadText(signal.payload, 'headBranch', 200);
  const projectId = payloadText(signal.payload, 'projectId', 200);
  const details = [repository, branch, conclusion].filter(Boolean).join(' · ');
  const ruleId: CiAlertRuleId = failed
    ? 'repository.ci.failed.v1'
    : 'repository.ci.action_required.v1';

  return {
    ruleId,
    fingerprint: ciAlertFingerprint(ruleId, signal.id),
    title: `CI · ${name}`,
    ...(details ? { message: details } : {}),
    severity: failed ? 'urgent' : 'warning',
    signalId: signal.id,
    signalType: signal.type,
    occurredAt: signal.occurredAt,
    ...(projectId ? { projectId } : {}),
  };
}

function ciSeriesKey(signal: IntegrationSignal): string | null {
  if (signal.type !== 'repository.ci') return null;
  const resource =
    payloadText(signal.payload, 'resourceId', 200) ?? payloadText(signal.payload, 'repository', 300);
  if (!resource) return null;
  const name = payloadText(signal.payload, 'name', 160) ?? 'CI';
  const branch = payloadText(signal.payload, 'headBranch', 200) ?? '*';
  return JSON.stringify([resource, name, branch]);
}

function compareSignalsNewestFirst(left: IntegrationSignal, right: IntegrationSignal): number {
  const occurredDelta = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
  return occurredDelta !== 0 ? occurredDelta : right.id.localeCompare(left.id);
}

function isLifecycleConclusion(conclusion: string | undefined): boolean {
  return Boolean(
    conclusion &&
      (FAILURE_CONCLUSIONS.has(conclusion) ||
        ATTENTION_CONCLUSIONS.has(conclusion) ||
        HEALTHY_CONCLUSIONS.has(conclusion)),
  );
}

export function deriveAlertsFromIntegrationSignal(signal: IntegrationSignal): DerivedSignalAlert[] {
  const candidates = [ciAlert(signal)];
  return candidates.filter((candidate): candidate is DerivedSignalAlert => candidate !== null);
}

export function deriveAlertsFromIntegrationSignals(signals: IntegrationSignal[]): DerivedSignalAlert[] {
  return signals.flatMap(deriveAlertsFromIntegrationSignal);
}

export function reconcileAlertsFromIntegrationSignals(
  signals: IntegrationSignal[],
): DerivedSignalAlertReconciliation {
  const active: DerivedSignalAlert[] = [];
  const resolutions = new Map<string, DerivedSignalAlertResolution>();
  const ciGroups = new Map<string, IntegrationSignal[]>();

  for (const signal of signals) {
    if (signal.type !== 'repository.ci') {
      active.push(...deriveAlertsFromIntegrationSignal(signal));
      continue;
    }

    const seriesKey = ciSeriesKey(signal);
    if (!seriesKey) {
      active.push(...deriveAlertsFromIntegrationSignal(signal));
      continue;
    }
    const group = ciGroups.get(seriesKey) ?? [];
    group.push(signal);
    ciGroups.set(seriesKey, group);
  }

  for (const group of ciGroups.values()) {
    group.sort(compareSignalsNewestFirst);
    const decisive = group.find((signal) => isLifecycleConclusion(ciConclusion(signal)));
    if (!decisive) continue;

    const candidate = ciAlert(decisive);
    if (candidate) active.push(candidate);
    const activeFingerprint = candidate?.fingerprint;

    for (const signal of group) {
      for (const ruleId of CI_ALERT_RULE_IDS) {
        const fingerprint = ciAlertFingerprint(ruleId, signal.id);
        if (fingerprint === activeFingerprint) continue;
        resolutions.set(fingerprint, {
          ruleId,
          fingerprint,
          causeSignalId: decisive.id,
          signalType: 'repository.ci',
          occurredAt: decisive.occurredAt,
        });
      }
    }
  }

  return { active, resolve: [...resolutions.values()] };
}
