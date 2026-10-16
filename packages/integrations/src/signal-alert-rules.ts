import type { IntegrationSignal, IntegrationSignalType } from './index.js';

export type DerivedAlertSeverity = 'info' | 'warning' | 'urgent' | 'critical';

export const STALE_WORK_AFTER_DAYS = 7;
export const MIN_STALE_WORK_AFTER_DAYS = 1;
export const MAX_STALE_WORK_AFTER_DAYS = 365;

export const BUILT_IN_SIGNAL_ALERT_RULES = [
  {
    id: 'repository.ci.failed.v1',
    signalType: 'repository.ci',
    defaultEnabled: true,
    defaultSeverity: 'urgent',
  },
  {
    id: 'repository.ci.action_required.v1',
    signalType: 'repository.ci',
    defaultEnabled: true,
    defaultSeverity: 'warning',
  },
  {
    id: 'repository.pull_request.stale.v1',
    signalType: 'repository.pull_request',
    defaultEnabled: false,
    defaultSeverity: 'warning',
    defaultStaleAfterDays: STALE_WORK_AFTER_DAYS,
  },
  {
    id: 'repository.issue.stale.v1',
    signalType: 'repository.issue',
    defaultEnabled: false,
    defaultSeverity: 'warning',
    defaultStaleAfterDays: STALE_WORK_AFTER_DAYS,
  },
] as const satisfies readonly {
  id: string;
  signalType: IntegrationSignalType;
  defaultEnabled: boolean;
  defaultSeverity: DerivedAlertSeverity;
  defaultStaleAfterDays?: number;
}[];

export type BuiltInSignalAlertRuleId = (typeof BUILT_IN_SIGNAL_ALERT_RULES)[number]['id'];

export type SignalAlertRulePolicy = {
  ruleId: BuiltInSignalAlertRuleId;
  enabled: boolean;
  severity: DerivedAlertSeverity;
  staleAfterDays?: number;
};

export type SignalAlertRulePolicyMap = Partial<
  Record<
    BuiltInSignalAlertRuleId,
    Pick<SignalAlertRulePolicy, 'enabled' | 'severity' | 'staleAfterDays'>
  >
>;

export type RuleEvaluationContext = {
  now?: string;
};

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
const CI_ALERT_RULE_IDS = BUILT_IN_SIGNAL_ALERT_RULES.filter(
  (rule) => rule.signalType === 'repository.ci',
).map((rule) => rule.id) as BuiltInSignalAlertRuleId[];

function payloadText(payload: Record<string, unknown>, key: string, maxLength = 300): string | undefined {
  const value = payload[key];
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : undefined;
}

function payloadNumber(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function payloadBoolean(payload: Record<string, unknown>, key: string): boolean | undefined {
  const value = payload[key];
  return typeof value === 'boolean' ? value : undefined;
}

function ciConclusion(signal: IntegrationSignal): string | undefined {
  if (signal.type !== 'repository.ci') return undefined;
  return payloadText(signal.payload, 'conclusion', 80)?.toLowerCase();
}

function signalAlertFingerprint(ruleId: BuiltInSignalAlertRuleId, signalId: string): string {
  return `integration-rule:${ruleId}:${signalId}`;
}

function evaluationNow(context?: RuleEvaluationContext): { iso: string; ms: number } {
  const iso = context?.now ?? new Date().toISOString();
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new Error('signal_alert_rule_now_invalid');
  return { iso: new Date(ms).toISOString(), ms };
}

export function isStaleWorkRuleId(value: string): value is BuiltInSignalAlertRuleId {
  return value === 'repository.pull_request.stale.v1' || value === 'repository.issue.stale.v1';
}

function validatedStaleAfterDays(value: number | undefined): number {
  const candidate = value ?? STALE_WORK_AFTER_DAYS;
  if (
    !Number.isInteger(candidate) ||
    candidate < MIN_STALE_WORK_AFTER_DAYS ||
    candidate > MAX_STALE_WORK_AFTER_DAYS
  ) {
    throw new Error('signal_alert_rule_stale_after_days_invalid');
  }
  return candidate;
}

export function defaultSignalAlertRulePolicies(): SignalAlertRulePolicy[] {
  return BUILT_IN_SIGNAL_ALERT_RULES.map((rule) => ({
    ruleId: rule.id,
    enabled: rule.defaultEnabled,
    severity: rule.defaultSeverity,
    ...('defaultStaleAfterDays' in rule
      ? { staleAfterDays: rule.defaultStaleAfterDays }
      : {}),
  }));
}

export function isBuiltInSignalAlertRuleId(value: string): value is BuiltInSignalAlertRuleId {
  return BUILT_IN_SIGNAL_ALERT_RULES.some((rule) => rule.id === value);
}

function effectivePolicy(
  ruleId: BuiltInSignalAlertRuleId,
  policies: SignalAlertRulePolicyMap | undefined,
): Pick<SignalAlertRulePolicy, 'enabled' | 'severity' | 'staleAfterDays'> {
  const definition = BUILT_IN_SIGNAL_ALERT_RULES.find((rule) => rule.id === ruleId);
  if (!definition) throw new Error('signal_alert_rule_definition_missing');
  const override = policies?.[ruleId];
  return {
    enabled: override?.enabled ?? definition.defaultEnabled,
    severity: override?.severity ?? definition.defaultSeverity,
    ...(isStaleWorkRuleId(ruleId)
      ? { staleAfterDays: validatedStaleAfterDays(override?.staleAfterDays) }
      : {}),
  };
}

function ciAlert(
  signal: IntegrationSignal,
  policies?: SignalAlertRulePolicyMap,
): DerivedSignalAlert | null {
  if (signal.type !== 'repository.ci') return null;
  const conclusion = ciConclusion(signal);
  if (!conclusion) return null;

  const failed = FAILURE_CONCLUSIONS.has(conclusion);
  const attentionRequired = ATTENTION_CONCLUSIONS.has(conclusion);
  if (!failed && !attentionRequired) return null;

  const ruleId: BuiltInSignalAlertRuleId = failed
    ? 'repository.ci.failed.v1'
    : 'repository.ci.action_required.v1';
  const policy = effectivePolicy(ruleId, policies);
  if (!policy.enabled) return null;

  const name = payloadText(signal.payload, 'name', 160) ?? 'CI';
  const repository = payloadText(signal.payload, 'repository', 300);
  const branch = payloadText(signal.payload, 'headBranch', 200);
  const projectId = payloadText(signal.payload, 'projectId', 200);
  const details = [repository, branch, conclusion].filter(Boolean).join(' · ');

  return {
    ruleId,
    fingerprint: signalAlertFingerprint(ruleId, signal.id),
    title: `CI · ${name}`,
    ...(details ? { message: details } : {}),
    severity: policy.severity,
    signalId: signal.id,
    signalType: signal.type,
    occurredAt: signal.occurredAt,
    ...(projectId ? { projectId } : {}),
  };
}

function staleWorkRuleId(signal: IntegrationSignal): BuiltInSignalAlertRuleId | null {
  if (signal.type === 'repository.pull_request') return 'repository.pull_request.stale.v1';
  if (signal.type === 'repository.issue') return 'repository.issue.stale.v1';
  return null;
}

function staleWorkAlert(
  signal: IntegrationSignal,
  policies: SignalAlertRulePolicyMap | undefined,
  context?: RuleEvaluationContext,
): DerivedSignalAlert | null {
  const ruleId = staleWorkRuleId(signal);
  if (!ruleId) return null;

  const state = payloadText(signal.payload, 'state', 50)?.toLowerCase();
  if (state !== 'open') return null;
  if (signal.type === 'repository.pull_request' && payloadBoolean(signal.payload, 'merged') === true) {
    return null;
  }

  const signalMs = Date.parse(signal.occurredAt);
  if (!Number.isFinite(signalMs)) return null;
  const now = evaluationNow(context);
  const policy = effectivePolicy(ruleId, policies);
  const staleAfterDays = validatedStaleAfterDays(policy.staleAfterDays);
  const staleAfterMs = staleAfterDays * 24 * 60 * 60 * 1000;
  if (now.ms - signalMs < staleAfterMs) return null;
  if (!policy.enabled) return null;

  const repository = payloadText(signal.payload, 'repository', 300);
  const projectId = payloadText(signal.payload, 'projectId', 200);
  const title = payloadText(signal.payload, 'title', 300);
  const number = payloadNumber(signal.payload, 'number');
  const kind = signal.type === 'repository.pull_request' ? 'PR' : 'Issue';
  const label = [number !== undefined ? `#${number}` : undefined, title].filter(Boolean).join(' · ');
  const details = [repository, `no activity for ${staleAfterDays}+ days`]
    .filter(Boolean)
    .join(' · ');

  return {
    ruleId,
    fingerprint: signalAlertFingerprint(ruleId, signal.id),
    title: `Stale ${kind}${label ? ` · ${label}` : ''}`,
    ...(details ? { message: details } : {}),
    severity: policy.severity,
    signalId: signal.id,
    signalType: signal.type,
    occurredAt: now.iso,
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

export function deriveAlertsFromIntegrationSignal(
  signal: IntegrationSignal,
  policies?: SignalAlertRulePolicyMap,
  context?: RuleEvaluationContext,
): DerivedSignalAlert[] {
  const candidates = [ciAlert(signal, policies), staleWorkAlert(signal, policies, context)];
  return candidates.filter((candidate): candidate is DerivedSignalAlert => candidate !== null);
}

export function deriveAlertsFromIntegrationSignals(
  signals: IntegrationSignal[],
  policies?: SignalAlertRulePolicyMap,
  context?: RuleEvaluationContext,
): DerivedSignalAlert[] {
  return signals.flatMap((signal) => deriveAlertsFromIntegrationSignal(signal, policies, context));
}

export function reconcileAlertsFromIntegrationSignals(
  signals: IntegrationSignal[],
  policies?: SignalAlertRulePolicyMap,
  context?: RuleEvaluationContext,
): DerivedSignalAlertReconciliation {
  const active: DerivedSignalAlert[] = [];
  const resolutions = new Map<string, DerivedSignalAlertResolution>();
  const ciGroups = new Map<string, IntegrationSignal[]>();
  const now = evaluationNow(context);

  for (const signal of signals) {
    const staleRuleId = staleWorkRuleId(signal);
    if (staleRuleId) {
      const candidate = staleWorkAlert(signal, policies, { now: now.iso });
      if (candidate) {
        active.push(candidate);
      } else {
        const fingerprint = signalAlertFingerprint(staleRuleId, signal.id);
        resolutions.set(fingerprint, {
          ruleId: staleRuleId,
          fingerprint,
          causeSignalId: signal.id,
          signalType: signal.type,
          occurredAt: now.iso,
        });
      }
      continue;
    }

    if (signal.type !== 'repository.ci') {
      active.push(...deriveAlertsFromIntegrationSignal(signal, policies, { now: now.iso }));
      continue;
    }

    const seriesKey = ciSeriesKey(signal);
    if (!seriesKey) {
      active.push(...deriveAlertsFromIntegrationSignal(signal, policies, { now: now.iso }));
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

    const candidate = ciAlert(decisive, policies);
    if (candidate) active.push(candidate);
    const activeFingerprint = candidate?.fingerprint;

    for (const signal of group) {
      for (const ruleId of CI_ALERT_RULE_IDS) {
        const fingerprint = signalAlertFingerprint(ruleId, signal.id);
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
