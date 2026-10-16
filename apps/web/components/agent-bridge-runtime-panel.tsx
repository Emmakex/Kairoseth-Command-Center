import type { AgentBridgeRuntimeSummary } from '../lib/agent-bridge-api';
import type { Locale } from '../lib/i18n';

const copy = {
  es: {
    title: 'Agent Bridge',
    help: 'Estado de runtimes, conectores y herramientas reportado por las instalaciones del workspace.',
    unavailable: 'La observabilidad de Agent Bridge no está disponible ahora mismo.',
    empty: 'Todavía no hay runtimes de Agent Bridge reportando en este workspace.',
    runtime: 'Runtime',
    online: 'En línea',
    stale: 'Sin actualizar',
    offline: 'Fuera de línea',
    connectors: 'conectores',
    tools: 'herramientas',
    degraded: 'conectores degradados',
    blocked: 'herramientas bloqueadas',
    lastReport: 'Último reporte',
    healthy: 'Saludable',
    unhealthy: 'No saludable',
    connectorDegraded: 'Degradado',
    available: 'Disponible',
    toolDegraded: 'Degradada',
    toolBlocked: 'Bloqueada',
  },
  en: {
    title: 'Agent Bridge',
    help: 'Runtime, connector and tool status reported by installations in this workspace.',
    unavailable: 'Agent Bridge observability is not available right now.',
    empty: 'No Agent Bridge runtimes are reporting in this workspace yet.',
    runtime: 'Runtime',
    online: 'Online',
    stale: 'Stale',
    offline: 'Offline',
    connectors: 'connectors',
    tools: 'tools',
    degraded: 'degraded connectors',
    blocked: 'blocked tools',
    lastReport: 'Last report',
    healthy: 'Healthy',
    unhealthy: 'Unhealthy',
    connectorDegraded: 'Degraded',
    available: 'Available',
    toolDegraded: 'Degraded',
    toolBlocked: 'Blocked',
  },
} as const;

function formatDate(value: string, locale: Locale, timeZone: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone,
    }).format(parsed);
  } catch {
    return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(parsed);
  }
}

function freshnessLabel(value: AgentBridgeRuntimeSummary['freshness'], locale: Locale): string {
  return copy[locale][value];
}

function connectorStatusLabel(
  value: 'healthy' | 'degraded' | 'unhealthy',
  locale: Locale,
): string {
  if (value === 'healthy') return copy[locale].healthy;
  if (value === 'degraded') return copy[locale].connectorDegraded;
  return copy[locale].unhealthy;
}

function toolStatusLabel(
  value: 'available' | 'degraded' | 'blocked',
  locale: Locale,
): string {
  if (value === 'available') return copy[locale].available;
  if (value === 'degraded') return copy[locale].toolDegraded;
  return copy[locale].toolBlocked;
}

export function AgentBridgeRuntimePanel({
  locale,
  timeZone,
  runtimes,
}: {
  locale: Locale;
  timeZone: string;
  runtimes: AgentBridgeRuntimeSummary[] | null;
}) {
  const labels = copy[locale];
  return (
    <article className="panel agent-bridge-runtime-panel">
      <div className="panel-heading management-heading">
        <div>
          <h2>{labels.title}</h2>
          <p>{labels.help}</p>
        </div>
        <span>{runtimes?.length ?? 0}</span>
      </div>

      {runtimes === null ? (
        <p className="empty-state">{labels.unavailable}</p>
      ) : runtimes.length === 0 ? (
        <p className="empty-state">{labels.empty}</p>
      ) : (
        <div className="integration-activity-list">
          {runtimes.map((runtime) => (
            <section className="integration-activity-item" key={runtime.installationId}>
              <div className="integration-activity-copy">
                <div className="integration-activity-title-row">
                  <span className="integration-type">{labels.runtime}</span>
                  <strong>{runtime.installationId}</strong>
                  <span className={`runtime-freshness runtime-freshness-${runtime.freshness}`}>
                    {freshnessLabel(runtime.freshness, locale)}
                  </span>
                </div>
                <div className="integration-meta">
                  <span>{runtime.connectorCount} {labels.connectors}</span>
                  <span>{runtime.toolCount} {labels.tools}</span>
                  <span>{runtime.degradedConnectorCount} {labels.degraded}</span>
                  <span>{runtime.blockedToolCount} {labels.blocked}</span>
                </div>
                <div className="integration-meta">
                  <span>{labels.lastReport}</span>
                  <time dateTime={runtime.receivedAt}>
                    {formatDate(runtime.receivedAt, locale, timeZone)}
                  </time>
                </div>
                <div className="agent-bridge-connector-list">
                  {runtime.connectors.map((connector) => {
                    const localizedName = connector.localizations?.[locale]?.name ?? connector.name;
                    return (
                      <div
                        className="agent-bridge-connector-row"
                        key={`${connector.connectorId}:${connector.connectorInstanceId}`}
                      >
                        <div>
                          <strong>{localizedName}</strong>
                          <span>{connector.connectorInstanceId} · v{connector.version}</span>
                        </div>
                        <span>
                          {connector.health
                            ? connectorStatusLabel(connector.health.status, locale)
                            : '—'}
                        </span>
                        {connector.health ? (
                          <div className="agent-bridge-tool-health">
                            {connector.health.tools.map((tool) => (
                              <span key={tool.runtimeToolId}>
                                {tool.toolId}: {toolStatusLabel(tool.availability, locale)}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </article>
  );
}
