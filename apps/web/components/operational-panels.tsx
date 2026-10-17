import type { TaskSummary, TodayResponse } from '../lib/api';
import type { DictionaryCopy, Locale } from '../lib/i18n';
import { TaskRecurrenceEditor } from './task-recurrence-editor';
import { TaskReminderEditor } from './task-reminder-editor';

const dependencyCopy = {
  es: {
    dependencies: 'Dependencias',
    help: 'Selecciona las tareas que deben completarse antes de esta tarea.',
    noneAvailable: 'No hay otras tareas disponibles en este ámbito.',
    selectedNone: 'Sin dependencias',
    pending: 'Pendientes',
    startBlocked: 'Completa primero las dependencias pendientes.',
    save: 'Guardar dependencias',
  },
  en: {
    dependencies: 'Dependencies',
    help: 'Select the tasks that must be completed before this task.',
    noneAvailable: 'There are no other tasks available in this scope.',
    selectedNone: 'No dependencies',
    pending: 'Pending',
    startBlocked: 'Complete pending dependencies before starting this task.',
    save: 'Save dependencies',
  },
} as const;

type TaskWithRecurrence = TaskSummary & {
  recurrenceRule?: {
    kind: 'interval_days';
    intervalDays: number;
  };
};

function statusLabels(copy: DictionaryCopy): Record<string, string> {
  return {
    planned: copy.statusPlanned,
    active: copy.statusActive,
    blocked: copy.statusBlocked,
    done: copy.statusDone,
    archived: copy.statusArchived,
    todo: copy.statusTodo,
    in_progress: copy.statusInProgress,
    cancelled: copy.statusCancelled,
    open: copy.statusOpen,
    acknowledged: copy.statusAcknowledged,
    resolved: copy.statusResolved,
    dismissed: copy.statusDismissed,
  };
}

function severityLabels(copy: DictionaryCopy): Record<string, string> {
  return {
    info: copy.severityInfo,
    warning: copy.severityWarning,
    urgent: copy.severityUrgent,
    critical: copy.severityCritical,
  };
}

function reminderLocalValue(instant: string, timeZone: string): string | null {
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value;
    const year = value('year');
    const month = value('month');
    const day = value('day');
    const hour = value('hour');
    const minute = value('minute');
    const second = value('second');
    return year && month && day && hour && minute && second
      ? `${year}-${month}-${day}T${hour}:${minute}:${second}`
      : null;
  } catch {
    return null;
  }
}

export function OperationalPanels({
  locale,
  scope,
  copy,
  today,
  taskCatalog,
  timeZone,
}: {
  locale: Locale;
  scope: 'workspace' | 'private';
  copy: DictionaryCopy;
  today: TodayResponse | null;
  taskCatalog: TaskSummary[];
  timeZone: string;
}) {
  const statuses = statusLabels(copy);
  const severities = severityLabels(copy);
  const dependencyText = dependencyCopy[locale];
  const taskById = new Map(taskCatalog.map((task) => [task.id, task] as const));

  return (
    <section className="operational-grid">
      <article className="panel">
        <div className="panel-heading">
          <h2>{copy.projects}</h2>
          <span>{today?.projects.length ?? 0}</span>
        </div>
        <div className="item-list">
          {today?.projects.length ? (
            today.projects.map((project) => (
              <div className="item-row item-row-manage" key={project.id}>
                <div className="item-copy">
                  <strong>{project.name}</strong>
                  <span>{statuses[project.status] ?? project.status}</span>
                </div>
                <form className="inline-operation project-operation" action="/api/operations" method="post">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="scope" value={scope} />
                  <input type="hidden" name="operation" value="project-status" />
                  <input type="hidden" name="id" value={project.id} />
                  <label>
                    <span>{copy.statusLabel}</span>
                    <select name="status" defaultValue={project.status}>
                      <option value="planned">{copy.statusPlanned}</option>
                      <option value="active">{copy.statusActive}</option>
                      <option value="blocked">{copy.statusBlocked}</option>
                      <option value="done">{copy.statusDone}</option>
                      <option value="archived">{copy.statusArchived}</option>
                    </select>
                  </label>
                  <label>
                    <span>{copy.progress}</span>
                    <input name="progress" type="number" min="0" max="100" defaultValue={project.progress} />
                  </label>
                  <button className="secondary-button" type="submit">
                    {copy.save}
                  </button>
                </form>
              </div>
            ))
          ) : (
            <p className="empty-state">{copy.noProjects}</p>
          )}
        </div>
      </article>

      <article className="panel">
        <div className="panel-heading">
          <h2>{copy.tasks}</h2>
          <span>{today?.tasks.length ?? 0}</span>
        </div>
        <div className="item-list">
          {today?.tasks.length ? (
            today.tasks.map((task) => {
              const dependencyCandidates = taskCatalog.filter((candidate) => candidate.id !== task.id);
              const catalogTask = (taskById.get(task.id) ?? task) as TaskWithRecurrence;
              const selectedDependencyIds = catalogTask.dependencyIds ?? [];
              const selectedDependencyNames = selectedDependencyIds.map(
                (dependencyId) => taskById.get(dependencyId)?.title ?? dependencyId,
              );
              const pendingDependencyIds = selectedDependencyIds.filter(
                (dependencyId) => taskById.get(dependencyId)?.status !== 'done',
              );
              const pendingDependencyNames = pendingDependencyIds.map(
                (dependencyId) => taskById.get(dependencyId)?.title ?? dependencyId,
              );
              const reminderValues = (catalogTask.reminderRules ?? [])
                .map((rule) => reminderLocalValue(rule.remindAt, timeZone))
                .filter((value): value is string => value !== null);
              const recurrenceInterval =
                catalogTask.recurrenceRule?.kind === 'interval_days'
                  ? catalogTask.recurrenceRule.intervalDays
                  : undefined;

              return (
                <div className="item-row item-row-manage" key={task.id}>
                  <div className="item-copy">
                    <strong>{task.title}</strong>
                    <span>
                      {statuses[task.status] ?? task.status} · {copy.priority} {task.priority}
                    </span>
                    <span>
                      {dependencyText.dependencies}: {' '}
                      {selectedDependencyNames.length
                        ? selectedDependencyNames.join(', ')
                        : dependencyText.selectedNone}
                    </span>
                    {pendingDependencyNames.length ? (
                      <span>{dependencyText.pending}: {pendingDependencyNames.join(', ')}</span>
                    ) : null}
                  </div>
                  <div className="task-operation-stack">
                    <form className="action-buttons" action="/api/operations" method="post">
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="scope" value={scope} />
                      <input type="hidden" name="operation" value="task-status" />
                      <input type="hidden" name="id" value={task.id} />
                      <button
                        className="secondary-button"
                        type="submit"
                        name="status"
                        value="in_progress"
                        disabled={task.status === 'in_progress' || pendingDependencyIds.length > 0}
                        title={pendingDependencyIds.length ? dependencyText.startBlocked : undefined}
                      >
                        {copy.start}
                      </button>
                      <button
                        className="secondary-button"
                        type="submit"
                        name="status"
                        value="blocked"
                        disabled={task.status === 'blocked'}
                      >
                        {copy.block}
                      </button>
                      <button className="primary-button small-primary" type="submit" name="status" value="done">
                        {copy.done}
                      </button>
                    </form>

                    <form className="inline-operation task-dependency-operation" action="/api/operations" method="post">
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="scope" value={scope} />
                      <input type="hidden" name="operation" value="task-dependencies" />
                      <input type="hidden" name="id" value={task.id} />
                      <label>
                        <span>{dependencyText.dependencies}</span>
                        <select
                          name="dependencyIds"
                          multiple
                          size={Math.min(6, Math.max(2, dependencyCandidates.length))}
                          defaultValue={selectedDependencyIds}
                          disabled={dependencyCandidates.length === 0}
                        >
                          {dependencyCandidates.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.title} · {statuses[candidate.status] ?? candidate.status}
                            </option>
                          ))}
                        </select>
                      </label>
                      <span className="empty-state">
                        {dependencyCandidates.length ? dependencyText.help : dependencyText.noneAvailable}
                      </span>
                      <button className="secondary-button" type="submit">
                        {dependencyText.save}
                      </button>
                    </form>

                    <TaskReminderEditor
                      locale={locale}
                      scope={scope}
                      taskId={task.id}
                      timeZone={timeZone}
                      initialValues={reminderValues}
                    />

                    <TaskRecurrenceEditor
                      locale={locale}
                      scope={scope}
                      taskId={task.id}
                      dueAt={catalogTask.dueAt}
                      intervalDays={recurrenceInterval}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <p className="empty-state">{copy.noTasks}</p>
          )}
        </div>
      </article>

      <article className="panel alerts-panel">
        <div className="panel-heading">
          <h2>{copy.alerts}</h2>
          <span>{today?.alerts.length ?? 0}</span>
        </div>
        <div className="item-list">
          {today?.alerts.length ? (
            today.alerts.map((alert) => (
              <div className="item-row item-row-manage" key={alert.id}>
                <div className="item-copy alert-copy">
                  <div className="alert-title-row">
                    <strong>{alert.title}</strong>
                    <span className={`severity severity-${alert.severity}`}>
                      {severities[alert.severity] ?? alert.severity}
                    </span>
                  </div>
                  <span>{alert.message ?? statuses[alert.status] ?? alert.status}</span>
                </div>
                <form className="action-buttons" action="/api/operations" method="post">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="scope" value={scope} />
                  <input type="hidden" name="operation" value="alert-status" />
                  <input type="hidden" name="id" value={alert.id} />
                  <button
                    className="secondary-button"
                    type="submit"
                    name="status"
                    value="acknowledged"
                    disabled={alert.status === 'acknowledged'}
                  >
                    {copy.acknowledge}
                  </button>
                  <button className="primary-button small-primary" type="submit" name="status" value="resolved">
                    {copy.resolve}
                  </button>
                  <button className="secondary-button" type="submit" name="status" value="dismissed">
                    {copy.dismiss}
                  </button>
                </form>
              </div>
            ))
          ) : (
            <p className="empty-state">{copy.noAlerts}</p>
          )}
        </div>
      </article>
    </section>
  );
}
