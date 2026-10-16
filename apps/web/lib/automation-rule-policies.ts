export type AutomationRuleSeverity = 'info' | 'warning' | 'urgent' | 'critical';

export type AutomationRulePolicyMutation = {
  path: string;
  method: 'PATCH';
  body: {
    enabled: boolean;
    severity: AutomationRuleSeverity;
  };
};

const builtInRuleIds = new Set([
  'repository.ci.failed.v1',
  'repository.ci.action_required.v1',
  'repository.pull_request.stale.v1',
  'repository.issue.stale.v1',
]);

const severities = new Set<AutomationRuleSeverity>(['info', 'warning', 'urgent', 'critical']);

function requiredText(form: FormData, name: string, maxLength: number): string | null {
  const value = form.get(name);
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

export function parseAutomationRulePolicyMutation(
  form: FormData,
): AutomationRulePolicyMutation | null {
  if (form.get('operation') !== 'rule-update') return null;

  const ruleId = requiredText(form, 'ruleId', 160);
  const enabledValue = form.get('enabled');
  const severityValue = form.get('severity');

  if (!ruleId || !builtInRuleIds.has(ruleId)) return null;
  if (enabledValue !== 'true' && enabledValue !== 'false') return null;
  if (typeof severityValue !== 'string' || !severities.has(severityValue as AutomationRuleSeverity)) {
    return null;
  }

  return {
    path: `/v1/automation/rules/${encodeURIComponent(ruleId)}`,
    method: 'PATCH',
    body: {
      enabled: enabledValue === 'true',
      severity: severityValue as AutomationRuleSeverity,
    },
  };
}
