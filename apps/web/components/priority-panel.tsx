import type {
  AutomationRuleSeverity,
  OperationalPriorityReasonSummary,
  OperationalPrioritySummary,
} from '../lib/api';
import type { Locale } from '../lib/i18n';

const copy = {
  es: {
    title: 'En foco',
    help: 'Lo que merece tu atención primero, ordenado automáticamente.',
    unavailable: 'No se pudieron calcular las prioridades.',
    empty: 'No hay nada urgente que priorizar ahora.',
    task: 'Tarea',
    alert: 'Alerta',
    project: 'Proyecto',
    milestone: 'Hito',
    manualPriority: 'Prioridad',
    blocked: 'Está bloqueada',
    dependencyImpact: 'Desbloquea otras tareas',
    overdue: 'Está vencida',
    dueToday: 'Vence hoy',
    severity: 'Severidad',
    projectBlocked: 'Proyecto bloqueado',
    projectOverdue: 'Proyecto vencido',
    projectDueToday: 'Proyecto vence hoy',
    projectRemainingProgress: 'Progreso pendiente',
    milestoneOverdue: 'Hito vencido',
    milestoneDueToday: 'Hito vence hoy',
    milestoneWeight: 'Peso del hito',
    severityInfo: 'informativa',
    severityWarning: 'aviso',
    severityUrgent: 'urgente',
    severityCritical: 'crítica',
  },
  en: {
    title: 'In focus',
    help: 'What deserves your attention first, ranked automatically.',
    unavailable: 'Priorities could not be calculated.',
    empty: 'There is nothing urgent to prioritize right now.',
    task: 'Task',
    alert: 'Alert',
    project: 'Project',
    milestone: 'Milestone',
    manualPriority: 'Priority',
    blocked: 'Blocked',
    dependencyImpact: 'Unblocks other tasks',
    overdue: 'Overdue',
    dueToday: 'Due today',
    severity: 'Severity',
    projectBlocked: 'Project blocked',
    projectOverdue: 'Project overdue',
    projectDueToday: 'Project due today',
    projectRemainingProgress: 'Progress remaining',
    milestoneOverdue: 'Milestone overdue',
    milestoneDueToday: 'Milestone due today',
    milestoneWeight: 'Milestone weight',
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

function kindLabel(locale: Locale, kind: OperationalPrioritySummary['kind']): string {
  const t = copy[locale];
  if (kind === 'task') return t.task;
  if (kind === 'alert') return t.alert;
  if (kind === 'project') return t.project;
  return t.milestone;
}

function reasonLabel(locale: Locale, reason: OperationalPriorityReasonSummary): string {
  const t = copy[locale];
  switch (reason.code) {
    case 'task.manual_priority':
      return `${t.manualPriority} ${reason.value ?? '—'}/100`;
    case 'task.blocked':
      return t.blocked;
    case 'task.dependency_impact':
      return `${t.dependencyImpact}: ${reason.value ?? 0}`;
    case 'task.overdue':
      return t.overdue;
    case 'task.due_today':
      return t.dueToday;
    case 'alert.severity':
      return `${t.severity}: ${severityLabel(locale, String(reason.value ?? 'info') as AutomationRuleSeverity)}`;
    case 'project.blocked':
      return t.projectBlocked;
    case 'project.overdue':
      return t.projectOverdue;
    case 'project.due_today':
      return t.projectDueToday;
    case 'project.remaining_progress':
      return `${t.projectRemainingProgress}: ${100 - Number(reason.value ?? 100)}%`;
    case 'milestone.overdue':
      return t.milestoneOverdue;
    case 'milestone.due_today':
      return t.milestoneDueToday;
    case 'milestone.weight':
      return `${t.milestoneWeight}: ${reason.value ?? '—'}/100`;
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
                  <span className="github-connection-status">{kindLabel(locale, item.kind)}</span>
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
