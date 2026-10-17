import type { Locale } from '../lib/i18n';

const copy = {
  es: {
    title: 'Recurrencia',
    help: 'Repite esta tarea con un intervalo fijo de días a partir de su fecha límite.',
    mode: 'Repetición',
    none: 'No repetir',
    interval: 'Cada cierto número de días',
    days: 'Intervalo en días',
    save: 'Guardar recurrencia',
    dueRequired: 'Añade una fecha límite a la tarea antes de activar la recurrencia.',
    dueAnchor: 'Fecha límite de referencia',
  },
  en: {
    title: 'Recurrence',
    help: 'Repeat this task on a fixed day interval from its due-date anchor.',
    mode: 'Repeat',
    none: 'Do not repeat',
    interval: 'Every fixed number of days',
    days: 'Interval in days',
    save: 'Save recurrence',
    dueRequired: 'Add a due date to the task before enabling recurrence.',
    dueAnchor: 'Due-date anchor',
  },
} as const;

export function TaskRecurrenceEditor({
  locale,
  scope,
  taskId,
  dueAt,
  intervalDays,
}: {
  locale: Locale;
  scope: 'workspace' | 'private';
  taskId: string;
  dueAt?: string | undefined;
  intervalDays?: number | undefined;
}) {
  const t = copy[locale];
  const hasDueAt = typeof dueAt === 'string' && Number.isFinite(Date.parse(dueAt));

  return (
    <form className="inline-operation task-recurrence-operation" action="/api/operations" method="post">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="operation" value="task-recurrence" />
      <input type="hidden" name="id" value={taskId} />

      <div className="item-copy">
        <strong>{t.title}</strong>
        <span>{t.help}</span>
        {hasDueAt ? <span>{t.dueAnchor}: {dueAt}</span> : <span>{t.dueRequired}</span>}
      </div>

      <label>
        <span>{t.mode}</span>
        <select name="recurrenceMode" defaultValue={intervalDays ? 'interval_days' : 'none'}>
          <option value="none">{t.none}</option>
          <option value="interval_days" disabled={!hasDueAt}>{t.interval}</option>
        </select>
      </label>

      <label>
        <span>{t.days}</span>
        <input
          name="intervalDays"
          type="number"
          min="1"
          max="365"
          step="1"
          defaultValue={intervalDays ?? 7}
          disabled={!hasDueAt}
        />
      </label>

      <button className="secondary-button" type="submit">
        {t.save}
      </button>
    </form>
  );
}
