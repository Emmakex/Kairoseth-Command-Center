import type { TimelineEventSummary } from '../lib/api';
import type { DictionaryCopy, Locale } from '../lib/i18n';

function formatEventDate(value: string, locale: Locale, timeZone: string): string {
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

function eventAction(type: string, copy: DictionaryCopy): string {
  const actions: Record<string, string> = {
    'project.created': copy.timelineProjectCreated,
    'project.quick_captured': copy.timelineProjectCaptured,
    'project.status_changed': copy.timelineProjectChanged,
    'task.created': copy.timelineTaskCreated,
    'task.quick_captured': copy.timelineTaskCaptured,
    'task.status_changed': copy.timelineTaskChanged,
    'alert.created': copy.timelineAlertCreated,
    'alert.status_changed': copy.timelineAlertChanged,
    'milestone.created': copy.timelineMilestoneCreated,
    'milestone.status_changed': copy.timelineMilestoneChanged,
    'decision.created': copy.timelineDecisionCreated,
  };
  return actions[type] ?? copy.timelineUnknown;
}

function localizedStatus(event: TimelineEventSummary, copy: DictionaryCopy): string | null {
  const raw = event.metadata.status;
  if (typeof raw !== 'string') return null;
  const statuses: Record<string, string> = {
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
    superseded: copy.statusSuperseded,
    reversed: copy.statusReversed,
  };
  return statuses[raw] ?? null;
}

function safeSummary(event: TimelineEventSummary): string {
  if (!event.type.endsWith('.status_changed')) return event.summary;
  const status = event.metadata.status;
  if (typeof status !== 'string') return event.summary;
  const suffix = `: ${status}`;
  return event.summary.endsWith(suffix) ? event.summary.slice(0, -suffix.length) : event.summary;
}

export function TimelinePanel({
  locale,
  copy,
  timeZone,
  events,
}: {
  locale: Locale;
  copy: DictionaryCopy;
  timeZone: string;
  events: TimelineEventSummary[] | null;
}) {
  return (
    <article className="panel timeline-panel">
      <div className="panel-heading management-heading">
        <div>
          <h2>{copy.timeline}</h2>
          <p>{copy.timelineHelp}</p>
        </div>
        <span>{events?.length ?? 0}</span>
      </div>

      {events === null ? (
        <p className="empty-state">{copy.timelineUnavailable}</p>
      ) : events.length === 0 ? (
        <p className="empty-state">{copy.noTimeline}</p>
      ) : (
        <div className="timeline-list">
          {events.slice(0, 30).map((event) => {
            const status = localizedStatus(event, copy);
            return (
              <div className="timeline-item" key={event.id}>
                <span className="timeline-dot" aria-hidden="true" />
                <div className="timeline-copy">
                  <div className="timeline-title-row">
                    <strong>{eventAction(event.type, copy)}</strong>
                    {status ? <span className="timeline-status">{status}</span> : null}
                  </div>
                  <span className="timeline-summary">{safeSummary(event)}</span>
                  <time dateTime={event.occurredAt}>{formatEventDate(event.occurredAt, locale, timeZone)}</time>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
