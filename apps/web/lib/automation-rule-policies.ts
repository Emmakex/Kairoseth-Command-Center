export type AutomationRuleSeverity = 'info' | 'warning' | 'urgent' | 'critical';

export type AutomationRulePolicyMutation = {
  path: string;
  method: 'PATCH';
  body: {
    enabled: boolean;
    severity: AutomationRuleSeverity;
    staleAfterDays?: number;
  };
};

const builtInRuleIds = new Set([
  'repository.ci.failed.v1',
  'repository.ci.action_required.v1',
  'repository.pull_request.stale.v1',
  'repository.issue.stale.v1',
]);
const staleRuleIds = new Set([
  'repository.pull_request.stale.v1',
  'repository.issue.stale.v1',
]);
const severities = new Set<AutomationRuleSeverity>(['info', 'warning', 'urgent', 'critical']);
const allowedFields = new Set([
  'locale',
  'operation',
  'ruleId',
  'enabled',
  'severity',
  'staleAfterDays',
]);

function requiredText(form: FormData, name: string, maxLength: number): string | null {
  const value = form.get(name);
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function parseStaleAfterDays(value: FormDataEntryValue | null): number | null | undefined {
  if (value === null) return undefined;
  if (typeof value !== 'string' || !/^\d{1,3}$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 365 ? parsed : null;
}

export function parseAutomationRulePolicyMutation(
  form: FormData,
): AutomationRulePolicyMutation | null {
  for (const key of form.keys()) {
    if (!allowedFields.has(key)) return null;
  }
  if (form.get('operation') !== 'rule-update') return null;

  const ruleId = requiredText(form, 'ruleId', 160);
  const enabledValue = form.get('enabled');
  const severityValue = form.get('severity');
  const staleAfterDays = parseStaleAfterDays(form.get('staleAfterDays'));

  if (!ruleId || !builtInRuleIds.has(ruleId)) return null;
  if (enabledValue !== 'true' && enabledValue !== 'false') return null;
  if (typeof severityValue !== 'string' || !severities.has(severityValue as AutomationRuleSeverity)) {
    return null;
  }
  if (staleAfterDays === null) return null;
  if (staleAfterDays !== undefined && !staleRuleIds.has(ruleId)) return null;

  return {
    path: `/v1/automation/rules/${encodeURIComponent(ruleId)}`,
    method: 'PATCH',
    body: {
      enabled: enabledValue === 'true',
      severity: severityValue as AutomationRuleSeverity,
      ...(staleAfterDays !== undefined ? { staleAfterDays } : {}),
    },
  };
}
