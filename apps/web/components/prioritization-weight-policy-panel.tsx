import type { PrioritizationWeightPolicySummary, PrioritizationWeightsSummary } from '../lib/api';
import type { Locale } from '../lib/i18n';

const copy = {
  es: {
    title: 'Pesos de priorización',
    help: 'Ajusta cuánto aporta cada señal a la puntuación. 0 desactiva esa contribución y la puntuación final sigue limitada a 100.',
    unavailable: 'No se pudieron cargar los pesos de priorización.',
    defaultPolicy: 'Configuración predeterminada',
    overriddenPolicy: 'Configuración personalizada',
    save: 'Guardar pesos',
    tasks: 'Tareas',
    alerts: 'Alertas',
    projects: 'Proyectos',
    milestones: 'Hitos',
    privateNote: 'Estos pesos se aplican solo al espacio de trabajo. La priorización privada mantiene los valores predeterminados.',
    labels: {
      taskManualPriorityMax: 'Prioridad manual máxima',
      taskBlocked: 'Tarea bloqueada',
      taskDependencyImpactPerDependent: 'Impacto por dependiente activo',
      taskOverdue: 'Tarea vencida',
      taskDueToday: 'Tarea vence hoy',
      alertInfo: 'Alerta informativa',
      alertWarning: 'Alerta de advertencia',
      alertUrgent: 'Alerta urgente',
      alertCritical: 'Alerta crítica',
      projectBlocked: 'Proyecto bloqueado',
      projectOverdue: 'Proyecto vencido',
      projectDueToday: 'Proyecto vence hoy',
      projectRemainingProgressMax: 'Progreso restante máximo',
      milestoneOverdue: 'Hito vencido',
      milestoneDueToday: 'Hito vence hoy',
      milestoneWeightMax: 'Peso máximo del hito',
    },
  },
  en: {
    title: 'Prioritization weights',
    help: 'Adjust how much each signal contributes to the score. 0 disables that contribution and the final score remains capped at 100.',
    unavailable: 'Prioritization weights could not be loaded.',
    defaultPolicy: 'Default configuration',
    overriddenPolicy: 'Custom configuration',
    save: 'Save weights',
    tasks: 'Tasks',
    alerts: 'Alerts',
    projects: 'Projects',
    milestones: 'Milestones',
    privateNote: 'These weights apply only to the workspace. Private prioritization keeps the product defaults.',
    labels: {
      taskManualPriorityMax: 'Manual priority maximum',
      taskBlocked: 'Task blocked',
      taskDependencyImpactPerDependent: 'Impact per active dependent',
      taskOverdue: 'Task overdue',
      taskDueToday: 'Task due today',
      alertInfo: 'Info alert',
      alertWarning: 'Warning alert',
      alertUrgent: 'Urgent alert',
      alertCritical: 'Critical alert',
      projectBlocked: 'Project blocked',
      projectOverdue: 'Project overdue',
      projectDueToday: 'Project due today',
      projectRemainingProgressMax: 'Remaining progress maximum',
      milestoneOverdue: 'Milestone overdue',
      milestoneDueToday: 'Milestone due today',
      milestoneWeightMax: 'Milestone weight maximum',
    },
  },
} as const;

const groups: readonly {
  key: 'tasks' | 'alerts' | 'projects' | 'milestones';
  fields: readonly (keyof PrioritizationWeightsSummary)[];
}[] = [
  {
    key: 'tasks',
    fields: [
      'taskManualPriorityMax',
      'taskBlocked',
      'taskDependencyImpactPerDependent',
      'taskOverdue',
      'taskDueToday',
    ],
  },
  {
    key: 'alerts',
    fields: ['alertInfo', 'alertWarning', 'alertUrgent', 'alertCritical'],
  },
  {
    key: 'projects',
    fields: ['projectBlocked', 'projectOverdue', 'projectDueToday', 'projectRemainingProgressMax'],
  },
  {
    key: 'milestones',
    fields: ['milestoneOverdue', 'milestoneDueToday', 'milestoneWeightMax'],
  },
];

export function PrioritizationWeightPolicyPanel({
  locale,
  policy,
}: {
  locale: Locale;
  policy: PrioritizationWeightPolicySummary | null;
}) {
  const t = copy[locale];

  return (
    <article className="panel github-setup-panel automation-rule-policy-panel">
      <div className="panel-heading management-heading">
        <div>
          <h2>{t.title}</h2>
          <p>{t.help}</p>
        </div>
        {policy ? (
          <span className="github-connection-status">
            {policy.overridden ? t.overriddenPolicy : t.defaultPolicy}
          </span>
        ) : null}
      </div>

      {policy === null ? <p className="empty-state">{t.unavailable}</p> : null}

      {policy ? (
        <form className="github-setup-list" action="/api/prioritization/weights" method="post">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="operation" value="priority-weights-update" />

          {groups.map((group) => (
            <fieldset className="github-setup-card" key={group.key}>
              <legend><strong>{t[group.key]}</strong></legend>
              {group.fields.map((field) => (
                <label key={field}>
                  <span>{t.labels[field]}</span>
                  <input
                    name={field}
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    defaultValue={policy.weights[field]}
                    required
                  />
                </label>
              ))}
            </fieldset>
          ))}

          <p className="empty-state">{t.privateNote}</p>
          <button className="primary-button" type="submit">
            {t.save}
          </button>
        </form>
      ) : null}
    </article>
  );
}
