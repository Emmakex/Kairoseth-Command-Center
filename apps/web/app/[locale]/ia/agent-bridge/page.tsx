import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card } from '@kcc/ui';
import { apiBaseUrl, getSession, readSessionToken } from '../../../../lib/api';
import {
  parseAgentBridgeApprovalRotationResponse,
  type AgentBridgeApprovalRotationStatus,
} from '../../../../lib/agent-bridge-rotation';
import {
  parseAgentBridgeCommandResponse,
  type AgentBridgeOperatorCommand,
} from '../../../../lib/agent-bridge-command';
import {
  parseAgentBridgeToolInventoryResponse,
  type AgentBridgeToolInventory,
} from '../../../../lib/agent-bridge-tools';
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
    subtitle: 'Visibilidad operativa y ejecución gobernada sobre los runtimes de Agent Bridge.',
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
      'La interfaz no expone sesiones runtime, correlaciones, huellas de acciones, claves ni tokens. Los resultados se proyectan y redactan antes de mostrarse.',
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
    rotationTitle: 'Seguridad de aprobaciones',
    rotationHelp:
      'Control de la cadena de confianza Ed25519 por espacio de trabajo. La interfaz nunca muestra claves, IDs de clave ni tokens.',
    rotationUnavailable: 'No se pudo cargar el estado de rotación de claves de aprobación.',
    generation: 'Generación',
    rotationPhase: 'Fase',
    trustedKeys: 'Claves confiables activas',
    rotateAction: 'Iniciar rotación segura',
    rotationInProgress: 'La rotación ya está en curso y avanzará cuando los runtimes activos confirmen la nueva generación.',
    rotationRequiresManage: 'Se requiere permiso de gestión del espacio de trabajo para controlar la rotación.',
    executionTitle: 'Consola de ejecución',
    executionHelp:
      'Ejecuta solo herramientas anunciadas por el runtime. Platform decide el riesgo y deriva READ o aprobación firmada; el navegador no puede elegirlo.',
    executionRequiresManage: 'Se requiere permiso de gestión del espacio de trabajo para ejecutar herramientas.',
    inventoryUnavailable: 'No hay inventario seguro disponible para los runtimes actuales.',
    inputLabel: 'Entrada JSON',
    executeRead: 'Ejecutar lectura',
    executeMutation: 'Firmar y ejecutar',
    risk: 'Riesgo',
    availability: 'Disponibilidad',
    commandTitle: 'Último comando',
    commandState: 'Estado',
    commandStatus: 'Resultado',
    commandAttempt: 'Intentos de entrega',
    commandReason: 'Detalle',
    commandOutput: 'Salida saneada',
    refreshCommand: 'Actualizar estado',
    commandUnavailable: 'No se pudo cargar el comando solicitado.',
    availabilityValues: {
      available: 'Disponible',
      degraded: 'Degradada',
      blocked: 'Bloqueada',
    },
    commandStates: {
      queued: 'En cola',
      delivered: 'Entregado al runtime',
      completed: 'Completado',
    },
    commandStatuses: {
      executed: 'Ejecutado',
      approval_required: 'Requiere aprobación',
      denied: 'Denegado',
      failed: 'Fallido',
      rejected: 'Rechazado',
      expired: 'Caducado',
      duplicate: 'Duplicado',
      indeterminate: 'Indeterminado',
    },
    executionResults: {
      queued: 'Comando encolado con el flujo de seguridad correspondiente.',
      forbidden: 'No tienes permiso para ejecutar herramientas de Agent Bridge.',
      inventory_missing: 'No existe un inventario runtime válido para esa instalación.',
      invalid_inventory: 'Platform rechazó el inventario runtime por no cumplir el contrato seguro.',
      tool_missing: 'La herramienta ya no está anunciada por el runtime.',
      tool_blocked: 'La herramienta no está disponible para ejecución.',
      invalid_input: 'La entrada debe ser JSON válido.',
      input_too_large: 'La entrada supera el límite seguro de 64 KiB.',
      unavailable: 'El servicio de ejecución no está disponible.',
      invalid: 'La solicitud de ejecución fue rechazada.',
      invalid_response: 'Platform devolvió una respuesta de comando no válida.',
      error: 'No se pudo ejecutar la solicitud.',
    },
    phaseValues: {
      stable: 'Estable',
      overlap: 'Solape seguro',
      retiring: 'Retirando clave anterior',
    },
    rotationResults: {
      started: 'Rotación iniciada. Los runtimes activos convergerán mediante sincronización firmada.',
      forbidden: 'No tienes permiso para iniciar la rotación.',
      conflict: 'La rotación no pudo iniciarse por un conflicto de estado.',
      unavailable: 'El servicio de aprobación no está disponible.',
      invalid: 'La solicitud de rotación no era válida.',
      error: 'No se pudo iniciar la rotación.',
    },
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
    subtitle: 'Operational visibility and governed execution across Agent Bridge runtimes.',
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
      'The interface does not expose runtime sessions, correlations, action fingerprints, keys or tokens. Results are projected and redacted before display.',
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
    rotationTitle: 'Approval security',
    rotationHelp:
      'Workspace-scoped Ed25519 trust-chain control. The interface never displays keys, key IDs or tokens.',
    rotationUnavailable: 'The approval-key rotation status could not be loaded.',
    generation: 'Generation',
    rotationPhase: 'Phase',
    trustedKeys: 'Active trusted keys',
    rotateAction: 'Start safe rotation',
    rotationInProgress: 'Rotation is already in progress and advances as active runtimes acknowledge the new generation.',
    rotationRequiresManage: 'Workspace management permission is required to control key rotation.',
    executionTitle: 'Execution console',
    executionHelp:
      'Execute only tools advertised by the runtime. Platform derives READ versus signed approval from authoritative risk; the browser cannot choose it.',
    executionRequiresManage: 'Workspace management permission is required to execute Agent Bridge tools.',
    inventoryUnavailable: 'No safe tool inventory is available for the current runtimes.',
    inputLabel: 'JSON input',
    executeRead: 'Execute read',
    executeMutation: 'Sign and execute',
    risk: 'Risk',
    availability: 'Availability',
    commandTitle: 'Latest command',
    commandState: 'State',
    commandStatus: 'Result',
    commandAttempt: 'Delivery attempts',
    commandReason: 'Detail',
    commandOutput: 'Sanitized output',
    refreshCommand: 'Refresh status',
    commandUnavailable: 'The requested command could not be loaded.',
    availabilityValues: {
      available: 'Available',
      degraded: 'Degraded',
      blocked: 'Blocked',
    },
    commandStates: {
      queued: 'Queued',
      delivered: 'Delivered to runtime',
      completed: 'Completed',
    },
    commandStatuses: {
      executed: 'Executed',
      approval_required: 'Approval required',
      denied: 'Denied',
      failed: 'Failed',
      rejected: 'Rejected',
      expired: 'Expired',
      duplicate: 'Duplicate',
      indeterminate: 'Indeterminate',
    },
    executionResults: {
      queued: 'Command queued through the appropriate security flow.',
      forbidden: 'You do not have permission to execute Agent Bridge tools.',
      inventory_missing: 'No valid runtime inventory exists for that installation.',
      invalid_inventory: 'Platform rejected the runtime inventory because it did not match the safe contract.',
      tool_missing: 'The runtime no longer advertises that tool.',
      tool_blocked: 'The tool is not available for execution.',
      invalid_input: 'Input must be valid JSON.',
      input_too_large: 'Input exceeds the safe 64 KiB limit.',
      unavailable: 'The execution service is unavailable.',
      invalid: 'The execution request was rejected.',
      invalid_response: 'Platform returned an invalid command response.',
      error: 'The execution request could not be completed.',
    },
    phaseValues: {
      stable: 'Stable',
      overlap: 'Safe overlap',
      retiring: 'Retiring previous key',
    },
    rotationResults: {
      started: 'Rotation started. Active runtimes will converge through signed synchronization.',
      forbidden: 'You do not have permission to start key rotation.',
      conflict: 'Rotation could not start because the state changed.',
      unavailable: 'The approval service is unavailable.',
      invalid: 'The rotation request was invalid.',
      error: 'Rotation could not be started.',
    },
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

async function getApprovalRotation(token: string): Promise<AgentBridgeApprovalRotationStatus | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/v1/products/agent-bridge/approval-keys/rotation`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const parsed = parseAgentBridgeApprovalRotationResponse(await response.json());
    return parsed?.status ?? null;
  } catch {
    return null;
  }
}

async function getToolInventory(
  token: string,
  installationId: string,
): Promise<AgentBridgeToolInventory | null> {
  try {
    const response = await fetch(
      `${apiBaseUrl()}/v1/products/agent-bridge/installations/${encodeURIComponent(installationId)}/tools`,
      {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!response.ok) return null;
    const parsed = parseAgentBridgeToolInventoryResponse(await response.json());
    return parsed?.inventory.installationId === installationId ? parsed.inventory : null;
  } catch {
    return null;
  }
}

async function getCommand(
  token: string,
  commandId: string,
): Promise<AgentBridgeOperatorCommand | null> {
  try {
    const response = await fetch(
      `${apiBaseUrl()}/v1/products/agent-bridge/commands/${encodeURIComponent(commandId)}`,
      {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!response.ok) return null;
    return parseAgentBridgeCommandResponse(await response.json())?.command ?? null;
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

function safeQueryText(value: string | string[] | undefined, max = 512): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= max ? normalized : null;
}

function outputText(value: unknown): string | null {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return null;
  }
}

export default async function AgentBridgeObservabilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    rotation?: string | string[];
    execution?: string | string[];
    command?: string | string[];
  }>;
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

  const canManageAgentBridge = session.capabilities.includes('workspace.manage');
  const [summary, runtimeSummary, rotationStatus, query] = await Promise.all([
    getObservability(token),
    getRuntimeObservability(token),
    canManageAgentBridge ? getApprovalRotation(token) : Promise.resolve(null),
    searchParams,
  ]);
  const commandId = safeQueryText(query.command);
  const [inventoryEntries, command] = await Promise.all([
    canManageAgentBridge && runtimeSummary
      ? Promise.all(
          runtimeSummary.installations.map(async (runtime) => [
            runtime.installationId,
            await getToolInventory(token, runtime.installationId),
          ] as const),
        )
      : Promise.resolve([] as Array<readonly [string, AgentBridgeToolInventory | null]>),
    canManageAgentBridge && commandId ? getCommand(token, commandId) : Promise.resolve(null),
  ]);
  const inventories = new Map(inventoryEntries);
  const text = copy[locale];
  const otherLocale = locale === 'es' ? 'en' : 'es';
  const latestActivity = formatTimestamp(summary?.latestUpdatedAt ?? null, locale, session.user.timezone);
  const authRequired = summary?.states.TASK_STATE_AUTH_REQUIRED ?? null;
  const rotationResult = safeQueryText(query.rotation, 64);
  const rotationNotice =
    rotationResult && rotationResult in text.rotationResults
      ? text.rotationResults[rotationResult as keyof typeof text.rotationResults]
      : null;
  const executionResult = safeQueryText(query.execution, 64);
  const executionNotice =
    executionResult && executionResult in text.executionResults
      ? text.executionResults[executionResult as keyof typeof text.executionResults]
      : null;
  const executionRows =
    canManageAgentBridge && runtimeSummary
      ? runtimeSummary.installations.flatMap((runtime) => {
          const inventory = inventories.get(runtime.installationId);
          return (inventory?.tools ?? []).map((tool) => ({ runtime, tool }));
        })
      : [];
  const commandOutput = outputText(command?.acknowledgement?.output);

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
      {canManageAgentBridge && !rotationStatus ? <div className="notice">{text.rotationUnavailable}</div> : null}
      {rotationNotice ? <div className="notice">{rotationNotice}</div> : null}
      {executionNotice ? <div className="notice">{executionNotice}</div> : null}
      {commandId && !command ? <div className="notice">{text.commandUnavailable}</div> : null}

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
              <h2>{text.executionTitle}</h2>
              <p>{text.executionHelp}</p>
            </div>
          </div>
          {canManageAgentBridge ? (
            executionRows.length ? (
              <div className="item-list">
                {executionRows.map(({ runtime, tool }) => {
                  const localized = tool.localizations?.[locale];
                  const usable = tool.availability === 'available';
                  return (
                    <form
                      action="/api/agent-bridge/execute"
                      className="item-row"
                      method="post"
                      key={`${runtime.installationId}:${tool.executionToolId}`}
                    >
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="installationId" value={runtime.installationId} />
                      <input type="hidden" name="executionToolId" value={tool.executionToolId} />
                      <div className="item-copy">
                        <strong>{localized?.name ?? tool.name}</strong>
                        <span>{localized?.description ?? tool.description}</span>
                        <span>
                          {runtime.installationId} · {tool.connector.name} {tool.connector.version} ·{' '}
                          {text.risk}: {tool.risk} · {text.availability}:{' '}
                          {text.availabilityValues[tool.availability]}
                        </span>
                        <label>
                          <span>{text.inputLabel}</span>
                          <textarea name="input" rows={4} defaultValue="{}" spellCheck={false} />
                        </label>
                      </div>
                      <button className="primary-button" type="submit" disabled={!usable}>
                        {tool.risk === 'READ' ? text.executeRead : text.executeMutation}
                      </button>
                    </form>
                  );
                })}
              </div>
            ) : (
              <p className="empty-state">{text.inventoryUnavailable}</p>
            )
          ) : (
            <p className="empty-state">{text.executionRequiresManage}</p>
          )}
        </article>

        {canManageAgentBridge && command ? (
          <article className="panel management-panel">
            <div className="panel-heading management-heading">
              <div>
                <h2>{text.commandTitle}</h2>
                <p>{command.commandId}</p>
              </div>
              <Link href={`/${locale}/ia/agent-bridge?command=${encodeURIComponent(command.commandId)}`}>
                {text.refreshCommand}
              </Link>
            </div>
            <div className="item-list">
              <div className="item-row">
                <div className="item-copy">
                  <strong>{command.toolId}</strong>
                  <span>{command.installationId}</span>
                </div>
                <strong>{text.commandStates[command.state]}</strong>
              </div>
              <div className="item-row">
                <div className="item-copy">
                  <strong>{text.commandAttempt}</strong>
                  <span>{text.commandState}: {text.commandStates[command.state]}</span>
                </div>
                <strong>{command.deliveryAttempt}</strong>
              </div>
              {command.acknowledgement ? (
                <div className="item-row">
                  <div className="item-copy">
                    <strong>{text.commandStatus}</strong>
                    <span>{text.commandStatuses[command.acknowledgement.status]}</span>
                    {command.acknowledgement.reason ? (
                      <span>{text.commandReason}: {command.acknowledgement.reason}</span>
                    ) : null}
                    {commandOutput ? (
                      <>
                        <span>{text.commandOutput}</span>
                        <pre>{commandOutput}</pre>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </article>
        ) : null}

        <article className="panel management-panel">
          <div className="panel-heading management-heading">
            <div>
              <h2>{text.rotationTitle}</h2>
              <p>{text.rotationHelp}</p>
            </div>
          </div>
          {canManageAgentBridge ? (
            rotationStatus ? (
              <div className="item-list">
                <div className="item-row">
                  <div className="item-copy">
                    <strong>{text.generation}</strong>
                    <span>{text.rotationPhase}: {text.phaseValues[rotationStatus.phase]}</span>
                  </div>
                  <strong>{rotationStatus.generation}</strong>
                </div>
                <div className="item-row">
                  <div className="item-copy">
                    <strong>{text.trustedKeys}</strong>
                    <span>{rotationStatus.phase === 'stable' ? text.phaseValues.stable : text.rotationInProgress}</span>
                  </div>
                  <strong>{rotationStatus.trustedKeyIds.length}</strong>
                </div>
                <form action="/api/agent-bridge/approval-keys/rotate" method="post">
                  <input type="hidden" name="locale" value={locale} />
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={rotationStatus.phase !== 'stable'}
                  >
                    {text.rotateAction}
                  </button>
                </form>
              </div>
            ) : (
              <p className="empty-state">{text.rotationUnavailable}</p>
            )
          ) : (
            <p className="empty-state">{text.rotationRequiresManage}</p>
          )}
        </article>

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
