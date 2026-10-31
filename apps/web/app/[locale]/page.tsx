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
import { PrioritizationWeightPolicyPanel } from '../../components/prioritization-weight-policy-panel';
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
  getPrioritizationWeightPolicy,
  getProjects,
  getSession,
  getTasks,
  getTimeline,
  getToday,
  readSessionToken,
} from '../../lib/api';
import { dictionary, isLocale, locales } from '../../lib/i18n';
import { getLocalMembers } from '../../lib/local-identities';

export const dynamic = 'force-dynamic';

const views = ['today', 'work', 'activity', 'settings'] as const;
type DashboardView = (typeof views)[number];

function isDashboardView(value: string | undefined): value is DashboardView {
  return views.includes(value as DashboardView);
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function CommandCenterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ scope?: string; result?: string; view?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const token = await readSessionToken();
  if (!token) redirect(`/${locale}/login`);

  const session = await getSession(token);
  if (!session) redirect(`/${locale}/login`);

  const { scope: requestedScope, result, view: requestedView } = await searchParams;
  const scope = requestedScope === 'private' ? 'private' : 'workspace';
  const view: DashboardView = isDashboardView(requestedView) ? requestedView : 'today';
  const canManageMembers = session.capabilities.includes('members.manage');
  const canManageIntegrations = session.capabilities.includes('integrations.manage');
  const canManageAutomation = session.capabilities.includes('automation.manage');
  const canViewAgentBridge =
    scope === 'workspace' && session.productEntitlements.includes('agent-bridge');
  const canReadPriorities =
    session.capabilities.includes('tasks.read') &&
    session.capabilities.includes('alerts.read') &&
    session.capabilities.includes('projects.read') &&
    session.capabilities.includes('milestones.read');
  const [
    today,
    priorities,
    projects,
    tasks,
    milestones,
    decisions,
    githubConnections,
    githubRepositories,
    integrationSignals,
    automationRules,
    prioritizationWeightPolicy,
    timeline,
    members,
  ] = await Promise.all([
    getToday(token, scope),
    canReadPriorities ? getPriorities(token, scope, 5) : Promise.resolve(null),
    getProjects(token, scope),
    getTasks(token, scope),
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
    scope === 'workspace' && canManageAutomation
      ? getPrioritizationWeightPolicy(token)
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
  const taskCatalog = tasks ?? today?.tasks ?? [];
  const resultMessages: Record<string, string> = {
    saved: copy.actionSaved,
    invalid: copy.actionInvalid,
    forbidden: copy.actionForbidden,
    'not-found': copy.actionNotFound,
    conflict: copy.actionError,
    error: copy.actionError,
  };
  const resultMessage = result ? resultMessages[result] : undefined;
  const viewLabels: Record<DashboardView, string> = {
    today: copy.today,
    work: copy.work,
    activity: copy.activity,
    settings: copy.settings,
  };
  const viewSubtitles: Record<DashboardView, string> = {
    today: copy.todaySubtitle,
    work: copy.workSubtitle,
    activity: copy.activitySubtitle,
    settings: copy.settingsSubtitle,
  };
  const currentQuery = `scope=${scope}&view=${view}`;

  return (
    <main className="shell dashboard-shell">
      <a className="skip-link" href="#main-content">
        {copy.skipToContent}
      </a>

      <nav className="topbar" aria-label={copy.productNavigation}>
        <div className="brand-lockup">
          <span className="product-mark" aria-hidden="true">
            {locale === 'es' ? 'GT' : 'WM'}
          </span>
          <strong>{copy.title}</strong>
        </div>
        <div className="topbar-actions">
          <Link href={`/${otherLocale}?${currentQuery}`}>{otherLocale.toUpperCase()}</Link>
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

      <nav className="view-nav" aria-label={copy.primaryNavigation}>
        {views.map((item) => (
          <Link
            key={item}
            href={`/${locale}?scope=${scope}&view=${item}`}
            aria-current={view === item ? 'page' : undefined}
            className={view === item ? 'active' : undefined}
          >
            {viewLabels[item]}
          </Link>
        ))}
      </nav>

      <header className="hero dashboard-hero premium-hero">
        <div>
          <span className="eyebrow">{copy.eyebrow}</span>
          <h1>{viewLabels[view]}</h1>
          <p>{viewSubtitles[view]}</p>
        </div>
        <div className="hero-meta">
          <div className="scope-switch" aria-label={copy.scope}>
            <Link
              className={scope === 'workspace' ? 'active' : ''}
              aria-current={scope === 'workspace' ? 'true' : undefined}
              href={`/${locale}?scope=workspace&view=${view}`}
            >
              {copy.workspace}
            </Link>
            <Link
              className={scope === 'private' ? 'active' : ''}
              aria-current={scope === 'private' ? 'true' : undefined}
              href={`/${locale}?scope=private&view=${view}`}
            >
              {copy.private}
            </Link>
          </div>
        </div>
      </header>

      <div id="main-content" className="view-content" tabIndex={-1}>
        {resultMessage ? (
          <div className={`notice ${result === 'saved' ? 'notice-success' : ''}`} role="status">
            {resultMessage}
          </div>
        ) : null}

        {view === 'today' ? (
          <>
            <QuickCapturePanel locale={locale} scope={scope} copy={copy} />

            <section className="metric-grid metric-grid-focus" aria-label={copy.today}>
              <Card title={copy.tasks}>{summary?.openTasks ?? '—'}</Card>
              <Card title={copy.dueToday}>{summary?.dueToday ?? '—'}</Card>
              <Card title={copy.blocked}>{summary?.blockedTasks ?? '—'}</Card>
              <Card title={copy.urgent}>{summary?.urgentAlerts ?? '—'}</Card>
            </section>

            {!today ? <div className="notice">{copy.apiUnavailable}</div> : null}

            {canReadPriorities ? <PriorityPanel locale={locale} priorities={priorities} /> : null}
          </>
        ) : null}

        {view === 'work' ? (
          <>
            <OperationalPanels
              locale={locale}
              scope={scope}
              copy={copy}
              today={today}
              taskCatalog={taskCatalog}
              timeZone={session.user.timezone}
            />

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
            </section>
          </>
        ) : null}

        {view === 'activity' ? (
          <section className="management-grid activity-view-grid">
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
          </section>
        ) : null}

        {view === 'settings' ? (
          <section className="management-grid settings-view-grid">
            {scope === 'workspace' && canManageAutomation ? (
              <AutomationRulePolicyPanel locale={locale} rules={automationRules} />
            ) : null}
            {scope === 'workspace' && canManageAutomation ? (
              <PrioritizationWeightPolicyPanel locale={locale} policy={prioritizationWeightPolicy} />
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
            {canViewAgentBridge ? (
              <article className="panel settings-shortcut-panel">
                <div>
                  <span className="eyebrow">IA</span>
                  <h2>Agent Bridge</h2>
                  <p>{copy.agentBridgeHelp}</p>
                </div>
                <Link className="settings-shortcut" href={`/${locale}/ia/agent-bridge`}>
                  {copy.openAgentBridge}
                </Link>
              </article>
            ) : null}
            <AccountPanel locale={locale} />
            {scope === 'workspace' && canManageMembers ? (
              <MemberPanel locale={locale} members={members} />
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
