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

type RuntimeObservabilitySummary = {
  totalInstallations: number;
  connectedInstallations: number;
  degradedInstallations: number;
  offlineInstallations: number;
  installations: Array<{
    installationId: string;
    bridgeInstanceId: string;
    deploymentMode: 'hosted' | 'local' | 'hybrid' | 'embedded';
    runtimeVersion: string;
    readiness: 'starting' | 'ready' | 'degraded' | 'unknown';
    connectivity: 'connected' | 'stale' | 'never_seen';
    lastHeartbeatAt: string | null;
    lastSnapshotAt: string | null;
    capabilities: string[];
    connectors: { total: number; healthy: number; degraded: number; unhealthy: number };
    tools: { total: number; available: number; degraded: number; blocked: number };
  }>;
};

type RuntimeObservabilityResponse = {
  version: 'kcc.agent-bridge-runtime-observability.v1';
  summary: RuntimeObservabilitySummary;
};

const copy = {
  es: {
    breadcrumb: 'Command Center · IA · Agent Bridge',
    eyebrow: 'Kairoseth Platform · IA',
    subtitle: 'Visibilidad operativa del backend autoritativo y los runtimes de Agent Bridge.',
    back: 'Volver a Today',
    available: 'Observabilidad disponible',
    unavailable: 'Observabilidad no disponible',
    totalTasks: 'Tareas A2A',
    activeClaims: 'Transiciones activas',
    installations: 'Instalaciones A2A',
    authRequired: 'Requieren autorización',
    taskStates: 'Estados de tareas',
    latestActivity: 'Última actividad A2A',
    noActivity: 'Sin actividad registrada',
    backendUnavailable: 'No se pudo cargar el resumen A2A de Agent Bridge. Comprueba la API y MongoDB.',
    runtimeUnavailable: 'No se pudo cargar el estado de runtimes de Agent Bridge.',
    privacy:
      'Esta vista muestra solo estado operativo seguro: no expone inputs de herramientas, correlaciones, huellas de acciones, claves ni tokens.',
    runtimeTitle: 'Runtimes',
    runtimeHelp: 'Conectividad autoritativa por heartbeat y salud reducida de conectores mediante snapshots autenticados.',
    connected: 'Conectados',
    degraded: 'Degradados',
    offline: 'Sin conexión',
    runtimeInstallations: 'Instalaciones runtime',
    noRuntimes: 'Todavía no hay runtimes enrolados en este espacio de trabajo.',
    version: 'Versión',
    deployment: 'Despliegue',
    readiness: 'Preparación',
    heartbeat: 'Heartbeat',
    snapshot: 'Snapshot',
    connectors: 'Conectores',
    tools: 'Herramientas',
    healthy: 'sanos',
    toolAvailable: 'disponibles',
    connectivity: {
      connected: 'Conectado',
      stale: 'Heartbeat vencido',
      never_seen: 'Sin heartbeat',
    },
    readinessValues: {
      starting: 'Iniciando',
      ready: 'Listo',
      degraded: 'Degradado',
      unknown: 'Desconocido',
    },
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
    subtitle: 'Operational visibility for the authoritative Agent Bridge backend and runtimes.',
    back: 'Back to Today',
    available: 'Observability available',
    unavailable: 'Observability unavailable',
    totalTasks: 'A2A tasks',
    activeClaims: 'Active transitions',
    installations: 'A2A installations',
    authRequired: 'Awaiting authorization',
    taskStates: 'Task states',
    latestActivity: 'Latest A2A activity',
    noActivity: 'No recorded activity',
    backendUnavailable: 'The Agent Bridge A2A summary could not be loaded. Check the API and MongoDB.',
    runtimeUnavailable: 'The Agent Bridge runtime status could not be loaded.',
    privacy:
      'This view exposes safe operational state only: tool inputs, correlations, action fingerprints, keys and tokens are not exposed.',
    runtimeTitle: 'Runtimes',
    runtimeHelp: 'Authoritative heartbeat connectivity and reduced connector health from authenticated snapshots.',
    connected: 'Connected',
    degraded: 'Degraded',
    offline: 'Offline',
    runtimeInstallations: 'Runtime installations',
    noRuntimes: 'No runtimes have been enrolled in this workspace yet.',
    version: 'Version',
    deployment: 'Deployment',
    readiness: 'Readiness',
    heartbeat: 'Heartbeat',
    snapshot: 'Snapshot',
    connectors: 'Connectors',
    tools: 'Tools',
    healthy: 'healthy',
    toolAvailable: 'available',
    connectivity: {
      connected: 'Connected',
      stale: 'Heartbeat stale',
      never_seen: 'No heartbeat',
    },
    readinessValues: {
      starting: 'Starting',
      ready: 'Ready',
      degraded: 'Degraded',
      unknown: 'Unknown',
    },
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

async function getRuntimeObservability(token: string): Promise<RuntimeObservabilitySummary | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/v1/products/agent-bridge/runtime-observability`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as RuntimeObservabilityResponse;
    return body.version === 'kcc.agent-bridge-runtime-observability.v1' ? body.summary : null;
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

  const [summary, runtimeSummary] = await Promise.all([
    getObservability(token),
    getRuntimeObservability(token),
  ]);
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
            <span
              className={summary && runtimeSummary ? 'status-dot status-dot-live' : 'status-dot'}
              aria-hidden="true"
            />
            <strong>{summary && runtimeSummary ? text.available : text.unavailable}</strong>
          </div>
        </div>
      </header>

      {!summary ? <div className="notice">{text.backendUnavailable}</div> : null}
      {!runtimeSummary ? <div className="notice">{text.runtimeUnavailable}</div> : null}

      <section className="metric-grid" aria-label={text.subtitle}>
        <Card title={text.totalTasks}>{summary?.totalTasks ?? '—'}</Card>
        <Card title={text.activeClaims}>{summary?.activeClaims ?? '—'}</Card>
        <Card title={text.installations}>{summary?.installations ?? '—'}</Card>
        <Card title={text.authRequired}>{authRequired ?? '—'}</Card>
      </section>

      <section className="metric-grid" aria-label={text.runtimeTitle}>
        <Card title={text.runtimeInstallations}>{runtimeSummary?.totalInstallations ?? '—'}</Card>
        <Card title={text.connected}>{runtimeSummary?.connectedInstallations ?? '—'}</Card>
        <Card title={text.degraded}>{runtimeSummary?.degradedInstallations ?? '—'}</Card>
        <Card title={text.offline}>{runtimeSummary?.offlineInstallations ?? '—'}</Card>
      </section>

      <section className="management-grid">
        <article className="panel management-panel">
          <div className="panel-heading management-heading">
            <div>
              <h2>{text.runtimeTitle}</h2>
              <p>{text.runtimeHelp}</p>
            </div>
          </div>
          <div className="item-list">
            {runtimeSummary?.installations.length ? (
              runtimeSummary.installations.map((runtime) => (
                <div className="item-row" key={runtime.installationId}>
                  <div className="item-copy">
                    <strong>{runtime.installationId}</strong>
                    <span>
                      {text.connectivity[runtime.connectivity]} · {text.readinessValues[runtime.readiness]} ·{' '}
                      {text.version} {runtime.runtimeVersion} · {text.deployment} {runtime.deploymentMode}
                    </span>
                    <span>
                      {text.connectors}: {runtime.connectors.healthy}/{runtime.connectors.total} {text.healthy} ·{' '}
                      {text.tools}: {runtime.tools.available}/{runtime.tools.total} {text.toolAvailable}
                    </span>
                    <span>
                      {text.heartbeat}: {formatTimestamp(runtime.lastHeartbeatAt, locale, session.user.timezone) ?? '—'} ·{' '}
                      {text.snapshot}: {formatTimestamp(runtime.lastSnapshotAt, locale, session.user.timezone) ?? '—'}
                    </span>
                  </div>
                  <strong>{runtime.capabilities.join(', ') || '—'}</strong>
                </div>
              ))
            ) : (
              <p className="empty-state">{text.noRuntimes}</p>
            )}
          </div>
        </article>

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
