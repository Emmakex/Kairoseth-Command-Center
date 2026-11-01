import type { DictionaryCopy, Locale } from '../lib/i18n';
import styles from './quick-capture-panel.module.css';

export function QuickCapturePanel({
  locale,
  scope,
  copy,
}: {
  locale: Locale;
  scope: 'workspace' | 'private';
  copy: DictionaryCopy;
}) {
  const optionalLabel = locale === 'es' ? 'Añadir detalles' : 'Add details';

  return (
    <section className="capture-panel" aria-labelledby="quick-capture-heading">
      <div className="capture-heading">
        <div>
          <h2 id="quick-capture-heading">{copy.quickCapture}</h2>
          <p>{copy.quickCaptureHelp}</p>
        </div>
      </div>
      <form className={styles.form} action="/api/operations" method="post">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="operation" value="quick-capture" />

        <div className={styles.primaryRow}>
          <label className="field compact-field">
            <span>{copy.kind}</span>
            <select name="kind" defaultValue="task">
              <option value="task">{copy.task}</option>
              <option value="project">{copy.project}</option>
            </select>
          </label>
          <label className="field title-field">
            <span>{copy.titleLabel}</span>
            <input
              name="title"
              required
              maxLength={160}
              autoComplete="off"
              placeholder={copy.titlePlaceholder}
            />
          </label>
          <button className="primary-button capture-button" type="submit">
            {copy.create}
          </button>
        </div>

        <details className={styles.optional}>
          <summary>{optionalLabel}</summary>
          <div className={styles.optionalGrid}>
            <label className="field description-field">
              <span>{copy.description}</span>
              <textarea
                name="description"
                rows={2}
                maxLength={4000}
                placeholder={copy.descriptionPlaceholder}
              />
            </label>
            <label className="field compact-field">
              <span>{copy.priorityTask}</span>
              <input name="priority" type="number" min="0" max="100" defaultValue="50" />
            </label>
          </div>
        </details>
      </form>
    </section>
  );
}
