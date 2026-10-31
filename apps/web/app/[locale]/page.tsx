import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card } from '@kcc/ui';
import { AccountPanel } from '../../components/account-panel';
import { AutomationRulePolicyPanel } from '../../components/automation-rule-policy-panel';
import { DashboardDisclosure } from '../../components/dashboard-disclosure';
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
import styles from './today.module.css';

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
    canReadPriorities ? getPriorities(token, scope, 8) : Promise.resolve(null),
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
  const uxCopy =
    locale === 'es'
      ? {
          product: 'Gestor de Trabajo',
          skip: 'Saltar al contenido principal',
          secondaryEyebrow: 'Cuando lo necesites',
          secondaryTitle: 'Más herramientas, sin ruido',
          secondaryHelp:
            'La vista Hoy se mantiene simple. Abre solo la sección que necesites para organizar, configurar o administrar.',
          planning: 'Planificación y seguimiento',
          planningHelp: 'Hitos, decisiones y actividad reciente.',
          automation: 'Automatización y prioridades',
          automationHelp: 'Reglas y pesos avanzados para adaptar cómo se ordena el trabajo.',
          integrations: 'Integraciones',
          integrationsHelp: 'GitHub y señales de herramientas conectadas.',
          account: 'Cuenta y equipo',
          accountHelp: 'Contraseña, miembros y administración del espacio de trabajo.',
        }
      : {
          product: 'Work Manager',
          skip: 'Skip to main content',
          secondaryEyebrow: 'When you need it',
          secondaryTitle: 'More tools, without the noise',
          secondaryHelp:
            'Today stays simple. Open only the section you need to organize, configure or administer.',
          planning: 'Planning and follow-up',
          planningHelp: 'Milestones, decisions and recent activity.',
          automation: 'Automation and priorities',
          automationHelp: 'Advanced rules and weights for adapting how work is ranked.',
          integrations: 'Integrations',
          integrationsHelp: 'GitHub and signals from connected tools.',
          account: 'Account and team',
          accountHelp: 'Password, members and workspace administration.',
        };

  return (
    <main className="shell dashboard-shell">
      <a className={styles.skipLink} href="#today-content">
        {uxCopy.skip}
      </a>

      <nav className="topbar" aria-label={uxCopy.product}>
        <div>
          <span className="product-mark">WM</span>
          <strong>{uxCopy.product}</strong>
        </div>
        <div className="topbar-actions">
          {canViewAgentBridge ? (
            <Link href={`/${locale}/ia/agent-bridge`}>
              {locale === 'es' ? 'IA · Agent Bridge' : 'AI · Agent Bridge'}
            </Link>
          ) : null}
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

      <header
        id="today-content"
        className={`hero dashboard-hero ${styles.compactHero} ${styles.contentTarget}`}
        tabIndex={-1}
      >
        <div>
          <span className="eyebrow">{copy.eyebrow}</span>
          <h1>{copy.today}</h1>
          <p>{copy.subtitle}</p>
        </div>
        <div className="hero-meta">
          <div className="status-row">
            <span className="status-dot status-dot-live" aria-hidden="true" />
            <span>{copy.status}</span>
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

      <OperationalPanels
        locale={locale}
        scope={scope}
        copy={copy}
        today={today}
        taskCatalog={taskCatalog}
        timeZone={session.user.timezone}
      />

      <section className={styles.secondaryTools} aria-labelledby="secondary-tools-heading">
        <div className={styles.secondaryHeading}>
          <span className="eyebrow">{uxCopy.secondaryEyebrow}</span>
          <h2 id="secondary-tools-heading">{uxCopy.secondaryTitle}</h2>
          <p>{uxCopy.secondaryHelp}</p>
        </div>

        <div className={styles.disclosureStack}>
          <DashboardDisclosure title={uxCopy.planning} description={uxCopy.planningHelp}>
            <div className={`management-grid ${styles.disclosureGrid}`}>
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
              <TimelinePanel
                locale={locale}
                copy={copy}
                timeZone={session.user.timezone}
                events={timeline}
              />
            </div>
          </DashboardDisclosure>

          {scope === 'workspace' && canManageAutomation ? (
            <DashboardDisclosure title={uxCopy.automation} description={uxCopy.automationHelp}>
              <div className={`management-grid ${styles.disclosureGrid}`}>
                <AutomationRulePolicyPanel locale={locale} rules={automationRules} />
                <PrioritizationWeightPolicyPanel locale={locale} policy={prioritizationWeightPolicy} />
              </div>
            </DashboardDisclosure>
          ) : null}

          {scope === 'workspace' ? (
            <DashboardDisclosure title={uxCopy.integrations} description={uxCopy.integrationsHelp}>
              <div className={`management-grid ${styles.disclosureGrid}`}>
                {canManageIntegrations ? (
                  <GitHubSetupPanel
                    locale={locale}
                    projects={projectCatalog}
                    connections={githubConnections}
                    repositories={githubRepositories}
                    webhooks={githubWebhooks}
                  />
                ) : null}
                <IntegrationActivityPanel
                  locale={locale}
                  copy={copy}
                  timeZone={session.user.timezone}
                  signals={integrationSignals}
                />
              </div>
            </DashboardDisclosure>
          ) : null}

          <DashboardDisclosure title={uxCopy.account} description={uxCopy.accountHelp}>
            <div className={`management-grid ${styles.disclosureGrid}`}>
              <AccountPanel locale={locale} />
              {scope === 'workspace' && canManageMembers ? (
                <MemberPanel locale={locale} members={members} />
              ) : null}
            </div>
          </DashboardDisclosure>
        </div>
      </section>
    </main>
  );
}
