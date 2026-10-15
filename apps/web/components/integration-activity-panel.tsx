import type { IntegrationSignalSummary } from '../lib/api';
import { integrationActivityView } from '../lib/integration-activity';
import type { DictionaryCopy, Locale } from '../lib/i18n';

function formatSignalDate(value: string, locale: Locale, timeZone: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  };
  try {
    return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', options).format(parsed);
  } catch {
    return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(parsed);
  }
}

export function IntegrationActivityPanel({
  locale,
  copy,
  timeZone,
  signals,
}: {
  locale: Locale;
  copy: DictionaryCopy;
  timeZone: string;
  signals: IntegrationSignalSummary[] | null;
}) {
  return (
    <article className="panel integration-activity-panel">
      <div className="panel-heading management-heading">
        <div>
          <h2>{copy.integrationActivity}</h2>
          <p>{copy.integrationActivityHelp}</p>
        </div>
        <span>{signals?.length ?? 0}</span>
      </div>

      {signals === null ? (
        <p className="empty-state">{copy.integrationActivityUnavailable}</p>
      ) : signals.length === 0 ? (
        <p className="empty-state">{copy.noIntegrationActivity}</p>
      ) : (
        <div className="integration-activity-list">
          {signals.slice(0, 12).map((signal) => {
            const view = integrationActivityView(signal, copy);
            return (
              <div className="integration-activity-item" key={signal.id}>
                <div className="integration-activity-copy">
                  <div className="integration-activity-title-row">
                    <span className="integration-type">{view.typeLabel}</span>
                    <strong>{view.title}</strong>
                  </div>
                  {view.detail ? <span className="integration-detail">{view.detail}</span> : null}
                  <div className="integration-meta">
                    <span>{view.source}</span>
                    <time dateTime={signal.occurredAt}>
                      {formatSignalDate(signal.occurredAt, locale, timeZone)}
                    </time>
                  </div>
                </div>
                {view.url ? (
                  <a
                    className="secondary-button integration-link"
                    href={view.url}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {copy.integrationOpenSource}
                  </a>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
