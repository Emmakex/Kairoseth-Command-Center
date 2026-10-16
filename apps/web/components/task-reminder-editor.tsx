'use client';

import { useState } from 'react';
import type { Locale } from '../lib/i18n';

const MAX_REMINDERS = 10;

const copy = {
  es: {
    title: 'Recordatorios',
    help: 'Añade hasta 10 recordatorios de una sola vez. La hora se interpreta en tu zona configurada.',
    add: 'Añadir recordatorio',
    remove: 'Quitar',
    save: 'Guardar recordatorios',
    empty: 'Sin recordatorios programados',
    time: 'Fecha y hora',
    zone: 'Zona horaria',
  },
  en: {
    title: 'Reminders',
    help: 'Add up to 10 one-time reminders. Times are interpreted in your configured time zone.',
    add: 'Add reminder',
    remove: 'Remove',
    save: 'Save reminders',
    empty: 'No reminders scheduled',
    time: 'Date and time',
    zone: 'Time zone',
  },
} as const;

export function TaskReminderEditor({
  locale,
  scope,
  taskId,
  timeZone,
  initialValues,
}: {
  locale: Locale;
  scope: 'workspace' | 'private';
  taskId: string;
  timeZone: string;
  initialValues: string[];
}) {
  const t = copy[locale];
  const [values, setValues] = useState<string[]>(initialValues.length ? initialValues : ['']);

  const updateValue = (index: number, value: string) => {
    setValues((current) => current.map((entry, entryIndex) => (entryIndex === index ? value : entry)));
  };

  const removeValue = (index: number) => {
    setValues((current) => {
      const next = current.filter((_, entryIndex) => entryIndex !== index);
      return next.length ? next : [''];
    });
  };

  return (
    <form className="inline-operation task-reminder-operation" action="/api/operations" method="post">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="operation" value="task-reminders" />
      <input type="hidden" name="id" value={taskId} />

      <div className="item-copy">
        <strong>{t.title}</strong>
        <span>{t.help}</span>
        <span>{t.zone}: {timeZone}</span>
      </div>

      <div className="task-reminder-list">
        {values.map((value, index) => (
          <div className="task-reminder-row" key={`${taskId}:${index}`}>
            <label>
              <span>{t.time}</span>
              <input
                name="remindAtLocal"
                type="datetime-local"
                step="1"
                value={value}
                onChange={(event) => updateValue(index, event.target.value)}
              />
            </label>
            <button className="text-button" type="button" onClick={() => removeValue(index)}>
              {t.remove}
            </button>
          </div>
        ))}
      </div>

      {initialValues.length === 0 && values.length === 1 && values[0] === '' ? (
        <span className="empty-state">{t.empty}</span>
      ) : null}

      <div className="action-buttons">
        <button
          className="secondary-button"
          type="button"
          disabled={values.length >= MAX_REMINDERS}
          onClick={() => setValues((current) => [...current, ''])}
        >
          {t.add}
        </button>
        <button className="secondary-button" type="submit">
          {t.save}
        </button>
      </div>
    </form>
  );
}
