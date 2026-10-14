import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card } from '@kcc/ui';
import { getSession, getToday, readSessionToken } from '../../lib/api';
import { dictionary, isLocale, locales } from '../../lib/i18n';

export const dynamic = 'force-dynamic';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function CommandCenterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ scope?: string; result?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const token = await readSessionToken();
  if (!token) redirect(`/${locale}/login`);

  const { scope: requestedScope, result } = await searchParams;
  const scope = requestedScope === 'private' ? 'private' : 'workspace';
  const [session, today] = await Promise.all([getSession(token), getToday(token, scope)]);
  if (!session) redirect(`/${locale}/login`);

  const copy = dictionary[locale];
  const otherLocale = locale === 'es' ? 'en' : 'es';
  const summary = today?.summary;
  const statusLabels: Record<string, string> = {
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
  const severityLabels: Record<string, string> = {
    info: copy.severityInfo,
    warning: copy.severityWarning,
    urgent: copy.severityUrgent,
    critical: copy.severityCritical,
  };
  const resultMessages: Record<string, string> = {
    saved: copy.actionSaved,
    invalid: copy.actionInvalid,
    forbidden: copy.actionForbidden,
    'not-found': copy.actionNotFound,
    error: copy.actionError,
  };
  const resultMessage = result ? resultMessages[result] : undefined;

  return (
    <main className="shell dashboard-shell">
      <nav className="topbar" aria-label="Command Center">
        <div>
          <span className="product-mark">KCC</span>
          <strong>{copy.title}</strong>
        </div>
        <div className="topbar-actions">
          <Link href={`/${otherLocale}?scope=${scope}`}>{otherLocale.toUpperCase()}</Link>
          <span className="user-label">
            {copy.signedInAs} <strong>{session.user.displayName}</strong>
          </span>
          <form action={`/api/auth/logout?locale=${locale}`} method="post">
            <button className="text-button" type="submit">
              {copy.logout}
            </button>
          </form>
        </div>
      </nav>

      <header className="hero dashboard-hero">
        <div>
          <span className="eyebrow">{copy.eyebrow}</span>
          <h1>{copy.today}</h1>
          <p>{copy.subtitle}</p>
        </div>
        <div className="hero-meta">
          <div className="status-row">
            <span className="status-dot status-dot-live" aria-hidden="true" />
            <span>{copy.status}</span>
            <strong>{copy.phase}</strong>
          </div>
          <div className="scope-switch" aria-label={copy.scope}>
            <Link className={scope === 'workspace' ? 'active' : ''} href={`/${locale}?scope=workspace`}>
              {copy.workspace}
            </Link>
            <Link className={scope === 'private' ? 'active' : ''} href={`/${locale}?scope=private`}>
              {copy.private}
            </Link>
          </div>
        </div>
      </header>

      {resultMessage ? (
        <div className={`notice ${result === 'saved' ? 'notice-success' : ''}`} role="status">
          {resultMessage}
        </div>
      ) : null}

      <section className="capture-panel" aria-labelledby="quick-capture-heading">
        <div className="capture-heading">
          <div>
            <span className="eyebrow">{copy.quickCapture}</span>
            <h2 id="quick-capture-heading">{copy.quickCapture}</h2>
            <p>{copy.quickCaptureHelp}</p>
          </div>
          <span className="scope-badge">{scope === 'private' ? copy.private : copy.workspace}</span>
        </div>
        <form className="quick-capture-form" action="/api/operations" method="post">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="operation" value="quick-capture" />
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
          <button className="primary-button capture-button" type="submit">
            {copy.create}
          </button>
        </form>
      </section>

      <section className="metric-grid" aria-label={copy.today}>
        <Card title={copy.projects}>{summary?.activeProjects ?? '—'}</Card>
        <Card title={copy.tasks}>{summary?.openTasks ?? '—'}</Card>
        <Card title={copy.dueToday}>{summary?.dueToday ?? '—'}</Card>
        <Card title={copy.blocked}>{summary?.blockedTasks ?? '—'}</Card>
        <Card title={copy.alerts}>{summary?.openAlerts ?? '—'}</Card>
        <Card title={copy.urgent}>{summary?.urgentAlerts ?? '—'}</Card>
      </section>

      {!today ? <div className="notice">{copy.apiUnavailable}</div> : null}

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
                    <span>{statusLabels[project.status] ?? project.status}</span>
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
              today.tasks.map((task) => (
                <div className="item-row item-row-manage" key={task.id}>
                  <div className="item-copy">
                    <strong>{task.title}</strong>
                    <span>
                      {statusLabels[task.status] ?? task.status} · {copy.priority} {task.priority}
                    </span>
                  </div>
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
                      disabled={task.status === 'in_progress'}
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
                </div>
              ))
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
                        {severityLabels[alert.severity] ?? alert.severity}
                      </span>
                    </div>
                    <span>{alert.message ?? statusLabels[alert.status] ?? alert.status}</span>
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
    </main>
  );
}
