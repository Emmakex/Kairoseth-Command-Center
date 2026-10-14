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
  searchParams: Promise<{ scope?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const token = await readSessionToken();
  if (!token) redirect(`/${locale}/login`);

  const { scope: requestedScope } = await searchParams;
  const scope = requestedScope === 'private' ? 'private' : 'workspace';
  const [session, today] = await Promise.all([getSession(token), getToday(token, scope)]);
  if (!session) redirect(`/${locale}/login`);

  const copy = dictionary[locale];
  const otherLocale = locale === 'es' ? 'en' : 'es';
  const summary = today?.summary;

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
                <div className="item-row" key={project.id}>
                  <div>
                    <strong>{project.name}</strong>
                    <span>{project.status}</span>
                  </div>
                  <div className="progress-block">
                    <span>{copy.progress}</span>
                    <strong>{project.progress}%</strong>
                  </div>
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
                <div className="item-row" key={task.id}>
                  <div>
                    <strong>{task.title}</strong>
                    <span>{task.status}</span>
                  </div>
                  <div className="progress-block">
                    <span>{copy.priority}</span>
                    <strong>{task.priority}</strong>
                  </div>
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
                <div className="item-row" key={alert.id}>
                  <div>
                    <strong>{alert.title}</strong>
                    <span>{alert.message ?? alert.status}</span>
                  </div>
                  <span className={`severity severity-${alert.severity}`}>{alert.severity}</span>
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
