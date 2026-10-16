import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card } from '@kcc/ui';
import { AccountPanel } from '../../components/account-panel';
import { AutomationRulePolicyPanel } from '../../components/automation-rule-policy-panel';
import { DecisionPanel } from '../../components/decision-panel';
import { GitHubSetupPanel } from '../../components/github-setup-panel';
import { IntegrationActivityPanel } from '../../components/integration-activity-panel';
import { MemberPanel } from '../../components/member-panel';
import { MilestonePanel } from '../../components/milestone-panel';
import { OperationalPanels } from '../../components/operational-panels';
import { PriorityPanel } from '../../components/priority-panel';
import { QuickCapturePanel } from '../../components/quick-capture-panel';
import { TimelinePanel } from '../../components/timeline-panel';
import {
  getAutomationRules,
  getDecisions,
  getGitHubConnections,
  getGitHubRepositories,
  getGitHubWebhookState,
  getIntegrationSignals,
  getMilestones,
  getPriorities,
  getProjects,
  getSession,
  getTimeline,
  getToday,
  readSessionToken,
} from '../../lib/api';
import { dictionary, isLocale, locales } from '../../lib/i18n';
import { getLocalMembers } from '../../lib/local-identities';

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

  const session = await getSession(token);
  if (!session) redirect(`/${locale}/login`);

  const { scope: requestedScope, result } = await searchParams;
  const scope = requestedScope === 'private' ? 'private' : 'workspace';
  const canManageMembers = session.capabilities.includes('members.manage');
  const canManageIntegrations = session.capabilities.includes('integrations.manage');
  const canManageAutomation = session.capabilities.includes('automation.manage');
  const canReadPriorities =
    session.capabilities.includes('tasks.read') && session.capabilities.includes('alerts.read');
  const [
    today,
    priorities,
    projects,
    milestones,
    decisions,
    githubConnections,
    githubRepositories,
    integrationSignals,
    automationRules,
    timeline,
    members,
  ] = await Promise.all([
    getToday(token, scope),
    canReadPriorities ? getPriorities(token, scope, 8) : Promise.resolve(null),
    getProjects(token, scope),
    getMilestones(token, scope),
    scope === 'workspace' ? getDecisions(token) : Promise.resolve(null),
    scope === 'workspace' && canManageIntegrations
      ? getGitHubConnections(token)
      : Promise.resolve(null),
    scope === 'workspace' && canManageIntegrations
      ? getGitHubRepositories(token)
      : Promise.resolve(null),
    scope === 'workspace' ? getIntegrationSignals(token, 12) : Promise.resolve(null),
    scope === 'workspace' && canManageAutomation
      ? getAutomationRules(token)
      : Promise.resolve(null),
    getTimeline(token, scope),
    scope === 'workspace' && canManageMembers ? getLocalMembers(token) : Promise.resolve(null),
  ]);

  const githubWebhooks =
    scope === 'workspace' && canManageIntegrations && githubConnections
      ? Object.fromEntries(
          await Promise.all(
            githubConnections.map(async (connection) => [
              connection.id,
              await getGitHubWebhookState(token, connection.id),
            ] as const),
          ),
        )
      : null;

  const copy = dictionary[locale];
  const otherLocale = locale === 'es' ? 'en' : 'es';
  const summary = today?.summary;
  const projectCatalog = projects ?? [];
  const resultMessages: Record<string, string> = {
    saved: copy.actionSaved,
    invalid: copy.actionInvalid,
    forbidden: copy.actionForbidden,
    'not-found': copy.actionNotFound,
    conflict: copy.actionError,
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

      <QuickCapturePanel locale={locale} scope={scope} copy={copy} />

      <section className="metric-grid" aria-label={copy.today}>
        <Card title={copy.projects}>{summary?.activeProjects ?? '—'}</Card>
        <Card title={copy.tasks}>{summary?.openTasks ?? '—'}</Card>
        <Card title={copy.dueToday}>{summary?.dueToday ?? '—'}</Card>
        <Card title={copy.blocked}>{summary?.blockedTasks ?? '—'}</Card>
        <Card title={copy.alerts}>{summary?.openAlerts ?? '—'}</Card>
        <Card title={copy.urgent}>{summary?.urgentAlerts ?? '—'}</Card>
      </section>

      {!today ? <div className="notice">{copy.apiUnavailable}</div> : null}

      {canReadPriorities ? <PriorityPanel locale={locale} priorities={priorities} /> : null}

      <OperationalPanels locale={locale} scope={scope} copy={copy} today={today} />

      <section className="management-grid">
        <MilestonePanel
          locale={locale}
          scope={scope}
          copy={copy}
          projects={projectCatalog}
          milestones={milestones}
        />
        {scope === 'workspace' ? (
          <DecisionPanel locale={locale} copy={copy} projects={projectCatalog} decisions={decisions} />
        ) : (
          <article className="panel management-panel decisions-panel workspace-only-panel">
            <div className="panel-heading management-heading">
              <div>
                <h2>{copy.decisions}</h2>
                <p>{copy.decisionHelp}</p>
              </div>
            </div>
            <p className="empty-state">{copy.decisionWorkspaceOnly}</p>
          </article>
        )}
        {scope === 'workspace' && canManageAutomation ? (
          <AutomationRulePolicyPanel locale={locale} rules={automationRules} />
        ) : null}
        {scope === 'workspace' && canManageIntegrations ? (
          <GitHubSetupPanel
            locale={locale}
            projects={projectCatalog}
            connections={githubConnections}
            repositories={githubRepositories}
            webhooks={githubWebhooks}
          />
        ) : null}
        {scope === 'workspace' ? (
          <IntegrationActivityPanel
            locale={locale}
            copy={copy}
            timeZone={session.user.timezone}
            signals={integrationSignals}
          />
        ) : null}
        <TimelinePanel
          locale={locale}
          copy={copy}
          timeZone={session.user.timezone}
          events={timeline}
        />
        <AccountPanel locale={locale} />
        {scope === 'workspace' && canManageMembers ? (
          <MemberPanel locale={locale} members={members} />
        ) : null}
      </section>
    </main>
  );
}
