import type { AutomationRulePolicySummary } from '../lib/api';
import type { Locale } from '../lib/i18n';

const copy = {
  es: {
    title: 'Reglas de automatización',
    help: 'Configura las reglas probadas que convierten señales operativas en alertas del espacio de trabajo.',
    unavailable: 'No se pudieron cargar las reglas de automatización.',
    noRules: 'No hay reglas de automatización disponibles.',
    enabled: 'Estado',
    enabledYes: 'Activa',
    enabledNo: 'Desactivada',
    severity: 'Severidad',
    save: 'Guardar regla',
    defaultPolicy: 'Configuración predeterminada',
    overriddenPolicy: 'Configuración personalizada',
    failedTitle: 'CI fallida',
    failedHelp: 'Genera una alerta cuando una ejecución de CI termina con fallo, timeout o error de arranque.',
    actionRequiredTitle: 'CI requiere acción',
    actionRequiredHelp: 'Genera una alerta cuando CI devuelve un estado que requiere intervención humana.',
    stalePullRequestTitle: 'PR sin actividad',
    stalePullRequestHelp: 'Genera una alerta cuando una pull request abierta lleva 7 días sin actividad.',
    staleIssueTitle: 'Issue sin actividad',
    staleIssueHelp: 'Genera una alerta cuando una issue abierta lleva 7 días sin actividad.',
    info: 'Informativa',
    warning: 'Advertencia',
    urgent: 'Urgente',
    critical: 'Crítica',
  },
  en: {
    title: 'Automation rules',
    help: 'Configure the proven rules that turn operational signals into workspace alerts.',
    unavailable: 'Automation rules could not be loaded.',
    noRules: 'No automation rules are available.',
    enabled: 'Status',
    enabledYes: 'Enabled',
    enabledNo: 'Disabled',
    severity: 'Severity',
    save: 'Save rule',
    defaultPolicy: 'Default configuration',
    overriddenPolicy: 'Custom configuration',
    failedTitle: 'CI failed',
    failedHelp: 'Creates an alert when a CI run ends in failure, timeout, or startup failure.',
    actionRequiredTitle: 'CI action required',
    actionRequiredHelp: 'Creates an alert when CI reports a state that requires human intervention.',
    stalePullRequestTitle: 'Stale pull request',
    stalePullRequestHelp: 'Creates an alert when an open pull request has had no activity for 7 days.',
    staleIssueTitle: 'Stale issue',
    staleIssueHelp: 'Creates an alert when an open issue has had no activity for 7 days.',
    info: 'Info',
    warning: 'Warning',
    urgent: 'Urgent',
    critical: 'Critical',
  },
} as const;

function ruleCopy(ruleId: string, locale: Locale) {
  const t = copy[locale];
  if (ruleId === 'repository.ci.failed.v1') {
    return { title: t.failedTitle, help: t.failedHelp };
  }
  if (ruleId === 'repository.ci.action_required.v1') {
    return { title: t.actionRequiredTitle, help: t.actionRequiredHelp };
  }
  if (ruleId === 'repository.pull_request.stale.v1') {
    return { title: t.stalePullRequestTitle, help: t.stalePullRequestHelp };
  }
  if (ruleId === 'repository.issue.stale.v1') {
    return { title: t.staleIssueTitle, help: t.staleIssueHelp };
  }
  return { title: ruleId, help: ruleId };
}

export function AutomationRulePolicyPanel({
  locale,
  rules,
}: {
  locale: Locale;
  rules: AutomationRulePolicySummary[] | null;
}) {
  const t = copy[locale];

  return (
    <article className="panel github-setup-panel automation-rule-policy-panel">
      <div className="panel-heading management-heading">
        <div>
          <h2>{t.title}</h2>
          <p>{t.help}</p>
        </div>
      </div>

      {rules === null ? <p className="empty-state">{t.unavailable}</p> : null}
      {rules?.length === 0 ? <p className="empty-state">{t.noRules}</p> : null}

      {rules?.length ? (
        <div className="github-setup-list">
          {rules.map((rule) => {
            const labels = ruleCopy(rule.ruleId, locale);
            return (
              <form
                className="github-setup-card github-connection-form"
                action="/api/automation/rules"
                method="post"
                key={rule.ruleId}
              >
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="operation" value="rule-update" />
                <input type="hidden" name="ruleId" value={rule.ruleId} />

                <div className="github-setup-card-copy">
                  <div className="github-setup-title-row">
                    <strong>{labels.title}</strong>
                    <span className="github-connection-status">
                      {rule.overridden ? t.overriddenPolicy : t.defaultPolicy}
                    </span>
                  </div>
                  <span>{labels.help}</span>
                  <code>{rule.ruleId}</code>
                </div>

                <label>
                  <span>{t.enabled}</span>
                  <select name="enabled" defaultValue={rule.enabled ? 'true' : 'false'}>
                    <option value="true">{t.enabledYes}</option>
                    <option value="false">{t.enabledNo}</option>
                  </select>
                </label>

                <label>
                  <span>{t.severity}</span>
                  <select name="severity" defaultValue={rule.severity}>
                    <option value="info">{t.info}</option>
                    <option value="warning">{t.warning}</option>
                    <option value="urgent">{t.urgent}</option>
                    <option value="critical">{t.critical}</option>
                  </select>
                </label>

                <button className="primary-button" type="submit">
                  {t.save}
                </button>
              </form>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}
