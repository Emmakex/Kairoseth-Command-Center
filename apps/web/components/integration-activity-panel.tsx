import type { IntegrationSignalSummary } from '../lib/api';
import type { DictionaryCopy, Locale } from '../lib/i18n';

function payloadText(payload: Record<string, unknown>, key: string, maxLength = 220): string | null {
  const value = payload[key];
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function payloadNumber(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function payloadBoolean(payload: Record<string, unknown>, key: string): boolean {
  return payload[key] === true;
}

export function safeIntegrationUrl(payload: Record<string, unknown>): string | null {
  const raw = payloadText(payload, 'url', 1000);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function signalTypeLabel(type: IntegrationSignalSummary['type'], copy: DictionaryCopy): string {
  const labels: Record<IntegrationSignalSummary['type'], string> = {
    'repository.commit': copy.integrationCommit,
    'repository.pull_request': copy.integrationPullRequest,
    'repository.issue': copy.integrationIssue,
    'repository.ci': copy.integrationCi,
    'repository.release': copy.integrationRelease,
    'calendar.event': copy.integrationCalendar,
    'generic.webhook': copy.integrationWebhook,
  };
  return labels[type];
}

function statusLabel(value: string, copy: DictionaryCopy): string {
  const normalized = value.toLowerCase();
  const labels: Record<string, string> = {
    open: copy.integrationStateOpen,
    closed: copy.integrationStateClosed,
    success: copy.integrationStateSuccess,
    failure: copy.integrationStateFailed,
    timed_out: copy.integrationStateFailed,
    startup_failure: copy.integrationStateFailed,
    action_required: copy.integrationStateActionRequired,
    cancelled: copy.statusCancelled,
    queued: copy.integrationStateQueued,
    in_progress: copy.statusInProgress,
    completed: copy.statusDone,
  };
  return labels[normalized] ?? value;
}

export type IntegrationActivityView = {
  typeLabel: string;
  title: string;
  detail: string;
  source: string;
  url: string | null;
};

export function integrationActivityView(
  signal: IntegrationSignalSummary,
  copy: DictionaryCopy,
): IntegrationActivityView {
  const payload = signal.payload;
  const repository = payloadText(payload, 'repository');
  const title = payloadText(payload, 'title');
  const name = payloadText(payload, 'name');
  const tagName = payloadText(payload, 'tagName');
  const headSha = payloadText(payload, 'headSha', 80);
  const state = payloadText(payload, 'state', 80);
  const conclusion = payloadText(payload, 'conclusion', 80);
  const status = payloadText(payload, 'status', 80);
  const number = payloadNumber(payload, 'number');

  let primary = title ?? name ?? tagName ?? repository ?? copy.integrationSignalFallback;
  if (signal.type === 'repository.commit' && headSha) primary = headSha.slice(0, 12);

  const details: string[] = [];
  if (repository && repository !== primary) details.push(repository);
  if (number !== null) details.push(`#${number}`);
  if (signal.type === 'repository.pull_request' && payloadBoolean(payload, 'merged')) {
    details.push(copy.integrationStateMerged);
  } else if (state) {
    details.push(statusLabel(state, copy));
  } else if (conclusion) {
    details.push(statusLabel(conclusion, copy));
  } else if (status) {
    details.push(statusLabel(status, copy));
  }
  if (signal.type === 'repository.release' && payloadBoolean(payload, 'prerelease')) {
    details.push(copy.integrationStatePrerelease);
  }
  if (signal.type === 'repository.pull_request' && payloadBoolean(payload, 'draft')) {
    details.push(copy.integrationStateDraft);
  }

  return {
    typeLabel: signalTypeLabel(signal.type, copy),
    title: primary,
    detail: details.join(' · '),
    source: signal.source.trim() || copy.integrationUnknownSource,
    url: safeIntegrationUrl(payload),
  };
}

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
