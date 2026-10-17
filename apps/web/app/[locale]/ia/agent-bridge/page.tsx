import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card } from '@kcc/ui';
import { apiBaseUrl, getSession, readSessionToken } from '../../../../lib/api';
import { isLocale } from '../../../../lib/i18n';

export const dynamic = 'force-dynamic';

type ObservabilitySummary = {
  totalTasks: number;
  activeClaims: number;
  installations: number;
  latestUpdatedAt: string | null;
  states: Record<string, number>;
};

type ObservabilityResponse = {
  version: 'kcc.agent-bridge-observability.v1';
  summary: ObservabilitySummary;
};

const copy = {
  es: {
    breadcrumb: 'Command Center · IA · Agent Bridge',
    eyebrow: 'Kairoseth Platform · IA',
    subtitle: 'Visibilidad operativa agregada del backend autoritativo de Agent Bridge.',
    back: 'Volver a Today',
    available: 'Observabilidad disponible',
    unavailable: 'Observabilidad no disponible',
    totalTasks: 'Tareas A2A',
    activeClaims: 'Transiciones activas',
    installations: 'Instalaciones',
    authRequired: 'Requieren autorización',
    taskStates: 'Estados de tareas',
    latestActivity: 'Última actividad',
    noActivity: 'Sin actividad registrada',
    backendUnavailable: 'No se pudo cargar el resumen de Agent Bridge. Comprueba la API y MongoDB.',
    privacy:
      'Esta vista muestra solo agregados del espacio de trabajo: no expone actores, inputs de herramientas, correlaciones, huellas de acciones ni secretos.',
    states: {
      TASK_STATE_UNSPECIFIED: 'Sin especificar',
      TASK_STATE_SUBMITTED: 'Enviadas',
      TASK_STATE_WORKING: 'En ejecución',
      TASK_STATE_COMPLETED: 'Completadas',
      TASK_STATE_FAILED: 'Fallidas',
      TASK_STATE_CANCELED: 'Canceladas',
      TASK_STATE_INPUT_REQUIRED: 'Esperan entrada',
      TASK_STATE_REJECTED: 'Rechazadas',
      TASK_STATE_AUTH_REQUIRED: 'Esperan autorización',
    },
  },
  en: {
    breadcrumb: 'Command Center · AI · Agent Bridge',
    eyebrow: 'Kairoseth Platform · AI',
    subtitle: 'Aggregated operational visibility for the authoritative Agent Bridge backend.',
    back: 'Back to Today',
    available: 'Observability available',
    unavailable: 'Observability unavailable',
    totalTasks: 'A2A tasks',
    activeClaims: 'Active transitions',
    installations: 'Installations',
    authRequired: 'Awaiting authorization',
    taskStates: 'Task states',
    latestActivity: 'Latest activity',
    noActivity: 'No recorded activity',
    backendUnavailable: 'The Agent Bridge summary could not be loaded. Check the API and MongoDB.',
    privacy:
      'This view exposes workspace aggregates only: actors, tool inputs, correlations, action fingerprints and secrets are not exposed.',
    states: {
      TASK_STATE_UNSPECIFIED: 'Unspecified',
      TASK_STATE_SUBMITTED: 'Submitted',
      TASK_STATE_WORKING: 'Working',
      TASK_STATE_COMPLETED: 'Completed',
      TASK_STATE_FAILED: 'Failed',
      TASK_STATE_CANCELED: 'Canceled',
      TASK_STATE_INPUT_REQUIRED: 'Input required',
      TASK_STATE_REJECTED: 'Rejected',
      TASK_STATE_AUTH_REQUIRED: 'Authorization required',
    },
  },
} as const;

async function getObservability(token: string): Promise<ObservabilitySummary | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/v1/products/agent-bridge/observability`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as ObservabilityResponse;
    return body.version === 'kcc.agent-bridge-observability.v1' ? body.summary : null;
  } catch {
    return null;
  }
}

function formatTimestamp(value: string | null, locale: 'es' | 'en', timeZone: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  try {
    return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export default async function AgentBridgeObservabilityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const token = await readSessionToken();
  if (!token) redirect(`/${locale}/login`);

  const session = await getSession(token);
  if (!session) redirect(`/${locale}/login`);
  if (!session.activeWorkspaceId || !session.productEntitlements.includes('agent-bridge')) {
    redirect(`/${locale}`);
  }

  const summary = await getObservability(token);
  const text = copy[locale];
  const otherLocale = locale === 'es' ? 'en' : 'es';
  const latestActivity = formatTimestamp(summary?.latestUpdatedAt ?? null, locale, session.user.timezone);
  const authRequired = summary?.states.TASK_STATE_AUTH_REQUIRED ?? null;

  return (
    <main className="shell dashboard-shell">
      <nav className="topbar" aria-label="Agent Bridge">
        <div>
          <span className="product-mark">KCC</span>
          <strong>{text.breadcrumb}</strong>
        </div>
        <div className="topbar-actions">
          <Link href={`/${locale}?scope=workspace`}>{text.back}</Link>
          <Link href={`/${otherLocale}/ia/agent-bridge`}>{otherLocale.toUpperCase()}</Link>
          <span className="user-label">
            <strong>{session.user.displayName}</strong>
          </span>
          <form action={`/api/auth/logout?locale=${locale}`} method="post">
            <button className="text-button" type="submit">
              {locale === 'es' ? 'Cerrar sesión' : 'Sign out'}
            </button>
          </form>
        </div>
      </nav>

      <header className="hero dashboard-hero">
        <div>
          <span className="eyebrow">{text.eyebrow}</span>
          <h1>Agent Bridge</h1>
          <p>{text.subtitle}</p>
        </div>
        <div className="hero-meta">
          <div className="status-row">
            <span className={summary ? 'status-dot status-dot-live' : 'status-dot'} aria-hidden="true" />
            <strong>{summary ? text.available : text.unavailable}</strong>
          </div>
        </div>
      </header>

      {!summary ? <div className="notice">{text.backendUnavailable}</div> : null}

      <section className="metric-grid" aria-label={text.subtitle}>
        <Card title={text.totalTasks}>{summary?.totalTasks ?? '—'}</Card>
        <Card title={text.activeClaims}>{summary?.activeClaims ?? '—'}</Card>
        <Card title={text.installations}>{summary?.installations ?? '—'}</Card>
        <Card title={text.authRequired}>{authRequired ?? '—'}</Card>
      </section>

      <section className="management-grid">
        <article className="panel management-panel">
          <div className="panel-heading management-heading">
            <div>
              <h2>{text.taskStates}</h2>
              <p>{text.subtitle}</p>
            </div>
          </div>
          <div className="item-list">
            {Object.entries(text.states).map(([state, label]) => (
              <div className="item-row" key={state}>
                <div className="item-copy">
                  <strong>{label}</strong>
                  <span>{state}</span>
                </div>
                <strong>{summary?.states[state] ?? '—'}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="panel management-panel">
          <div className="panel-heading management-heading">
            <div>
              <h2>{text.latestActivity}</h2>
              <p>{latestActivity ?? text.noActivity}</p>
            </div>
          </div>
          <p className="empty-state">{text.privacy}</p>
        </article>
      </section>
    </main>
  );
}
