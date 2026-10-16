import type {
  AutomationRuleSeverity,
  OperationalPriorityReasonSummary,
  OperationalPrioritySummary,
} from '../lib/api';
import type { Locale } from '../lib/i18n';

const copy = {
  es: {
    title: 'Prioridades explicables',
    help: 'Ordenadas con reglas deterministas. Cada elemento muestra por qué necesita atención.',
    unavailable: 'No se pudieron calcular las prioridades.',
    empty: 'No hay trabajo activo que priorizar.',
    task: 'Tarea',
    alert: 'Alerta',
    score: 'Puntuación',
    manualPriority: 'Prioridad manual',
    blocked: 'Tarea bloqueada',
    overdue: 'Tarea vencida',
    dueToday: 'Vence hoy',
    severity: 'Severidad',
    severityInfo: 'informativa',
    severityWarning: 'advertencia',
    severityUrgent: 'urgente',
    severityCritical: 'crítica',
  },
  en: {
    title: 'Explainable priorities',
    help: 'Ranked by deterministic rules. Every item shows exactly why it needs attention.',
    unavailable: 'Priorities could not be calculated.',
    empty: 'There is no active work to prioritize.',
    task: 'Task',
    alert: 'Alert',
    score: 'Score',
    manualPriority: 'Manual priority',
    blocked: 'Task blocked',
    overdue: 'Task overdue',
    dueToday: 'Due today',
    severity: 'Severity',
    severityInfo: 'info',
    severityWarning: 'warning',
    severityUrgent: 'urgent',
    severityCritical: 'critical',
  },
} as const;

function severityLabel(locale: Locale, severity: AutomationRuleSeverity | undefined): string {
  const t = copy[locale];
  if (severity === 'critical') return t.severityCritical;
  if (severity === 'urgent') return t.severityUrgent;
  if (severity === 'warning') return t.severityWarning;
  return t.severityInfo;
}

function reasonLabel(locale: Locale, reason: OperationalPriorityReasonSummary): string {
  const t = copy[locale];
  const suffix = reason.contribution > 0 ? `+${reason.contribution}` : `${reason.contribution}`;
  switch (reason.code) {
    case 'task.manual_priority':
      return `${t.manualPriority} ${reason.value ?? '—'}/100 (${suffix})`;
    case 'task.blocked':
      return `${t.blocked} (${suffix})`;
    case 'task.overdue':
      return `${t.overdue} (${suffix})`;
    case 'task.due_today':
      return `${t.dueToday} (${suffix})`;
    case 'alert.severity':
      return `${t.severity}: ${severityLabel(locale, String(reason.value ?? 'info') as AutomationRuleSeverity)} (${suffix})`;
  }
}

export function PriorityPanel({
  locale,
  priorities,
}: {
  locale: Locale;
  priorities: OperationalPrioritySummary[] | null;
}) {
  const t = copy[locale];

  return (
    <article className="panel priority-panel">
      <div className="panel-heading management-heading">
        <div>
          <h2>{t.title}</h2>
          <p>{t.help}</p>
        </div>
        <span>{priorities?.length ?? 0}</span>
      </div>

      {priorities === null ? <p className="empty-state">{t.unavailable}</p> : null}
      {priorities?.length === 0 ? <p className="empty-state">{t.empty}</p> : null}

      {priorities?.length ? (
        <div className="item-list">
          {priorities.map((item, index) => (
            <div className="item-row priority-row" key={`${item.kind}:${item.id}`}>
              <div className="item-copy">
                <div className="alert-title-row">
                  <strong>
                    {index + 1}. {item.title}
                  </strong>
                  <span className="github-connection-status">
                    {item.kind === 'task' ? t.task : t.alert} · {t.score} {item.score}
                  </span>
                </div>
                <span>{item.reasons.map((reason) => reasonLabel(locale, reason)).join(' · ')}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}
