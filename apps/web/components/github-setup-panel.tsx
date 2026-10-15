import type {
  GitHubConnectionSummary,
  GitHubRepositorySummary,
  ProjectSummary,
} from '../lib/api';
import type { Locale } from '../lib/i18n';

const copy = {
  es: {
    title: 'Configuración de GitHub',
    help: 'Conecta una cuenta de GitHub y enlaza repositorios a proyectos sin salir del Gestor de Trabajo.',
    unavailable: 'No se pudo cargar la configuración de GitHub.',
    connections: 'Conexiones',
    connectionHelp: 'Las credenciales se cifran en el servidor y nunca se vuelven a mostrar.',
    connectionName: 'Nombre de la conexión',
    connectionNamePlaceholder: 'GitHub principal',
    token: 'Token de acceso',
    tokenPlaceholder: 'github_pat_…',
    addConnection: 'Añadir conexión',
    validate: 'Validar',
    account: 'Cuenta',
    noConnections: 'Todavía no hay conexiones GitHub.',
    repositories: 'Repositorios enlazados',
    repositoryHelp: 'Relaciona un repositorio con un proyecto y una conexión validada.',
    project: 'Proyecto',
    owner: 'Propietario',
    repository: 'Repositorio',
    defaultBranch: 'Rama por defecto',
    addRepository: 'Enlazar repositorio',
    noProjects: 'Crea primero un proyecto para enlazar un repositorio.',
    noRepositories: 'Todavía no hay repositorios enlazados.',
    connection: 'Conexión',
    bind: 'Asociar',
    sync: 'Sincronizar ahora',
    unbound: 'Sin conexión',
    noValidatedConnections: 'No hay conexiones validadas disponibles.',
    lastCommit: 'Último commit',
    branch: 'Rama',
    statusActive: 'Activa',
    statusError: 'Error',
    statusUnverified: 'Sin validar',
    statusDisabled: 'Deshabilitada',
    configured: 'Credencial configurada',
  },
  en: {
    title: 'GitHub setup',
    help: 'Connect a GitHub account and link repositories to projects without leaving Work Manager.',
    unavailable: 'GitHub setup could not be loaded.',
    connections: 'Connections',
    connectionHelp: 'Credentials are encrypted on the server and are never displayed again.',
    connectionName: 'Connection name',
    connectionNamePlaceholder: 'Primary GitHub',
    token: 'Access token',
    tokenPlaceholder: 'github_pat_…',
    addConnection: 'Add connection',
    validate: 'Validate',
    account: 'Account',
    noConnections: 'There are no GitHub connections yet.',
    repositories: 'Linked repositories',
    repositoryHelp: 'Link a repository to a project and a validated connection.',
    project: 'Project',
    owner: 'Owner',
    repository: 'Repository',
    defaultBranch: 'Default branch',
    addRepository: 'Link repository',
    noProjects: 'Create a project before linking a repository.',
    noRepositories: 'There are no linked repositories yet.',
    connection: 'Connection',
    bind: 'Bind',
    sync: 'Sync now',
    unbound: 'No connection',
    noValidatedConnections: 'No validated connections are available.',
    lastCommit: 'Latest commit',
    branch: 'Branch',
    statusActive: 'Active',
    statusError: 'Error',
    statusUnverified: 'Unverified',
    statusDisabled: 'Disabled',
    configured: 'Credential configured',
  },
} as const;

function metadataText(repository: GitHubRepositorySummary, key: string): string | null {
  const value = repository.metadata[key];
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function statusLabel(status: string, locale: Locale): string {
  const t = copy[locale];
  const labels: Record<string, string> = {
    active: t.statusActive,
    error: t.statusError,
    unverified: t.statusUnverified,
    disabled: t.statusDisabled,
  };
  return labels[status] ?? status;
}

export function GitHubSetupPanel({
  locale,
  projects,
  connections,
  repositories,
}: {
  locale: Locale;
  projects: ProjectSummary[];
  connections: GitHubConnectionSummary[] | null;
  repositories: GitHubRepositorySummary[] | null;
}) {
  const t = copy[locale];
  const unavailable = connections === null || repositories === null;
  const activeConnections = (connections ?? []).filter(
    (connection) => connection.status === 'active' && Boolean(connection.lastValidatedAt),
  );
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const connectionNames = new Map((connections ?? []).map((connection) => [connection.id, connection.displayName]));

  return (
    <article className="panel github-setup-panel">
      <div className="panel-heading management-heading">
        <div>
          <h2>{t.title}</h2>
          <p>{t.help}</p>
        </div>
      </div>

      {unavailable ? <p className="empty-state">{t.unavailable}</p> : null}

      <section className="github-setup-section">
        <div className="github-setup-section-heading">
          <div>
            <h3>{t.connections}</h3>
            <p>{t.connectionHelp}</p>
          </div>
          <span>{connections?.length ?? 0}</span>
        </div>

        <form className="github-connection-form" action="/api/integrations/github" method="post">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="operation" value="connection-create" />
          <label>
            <span>{t.connectionName}</span>
            <input name="displayName" maxLength={160} placeholder={t.connectionNamePlaceholder} required />
          </label>
          <label>
            <span>{t.token}</span>
            <input
              name="token"
              type="password"
              minLength={20}
              maxLength={2048}
              placeholder={t.tokenPlaceholder}
              autoComplete="off"
              required
            />
          </label>
          <button className="primary-button" type="submit">
            {t.addConnection}
          </button>
        </form>

        {connections?.length ? (
          <div className="github-setup-list">
            {connections.map((connection) => (
              <div className="github-setup-card" key={connection.id}>
                <div className="github-setup-card-copy">
                  <div className="github-setup-title-row">
                    <strong>{connection.displayName}</strong>
                    <span className={`github-connection-status github-connection-status-${connection.status}`}>
                      {statusLabel(connection.status, locale)}
                    </span>
                  </div>
                  <span>
                    {connection.remoteAccountLabel
                      ? `${t.account}: ${connection.remoteAccountLabel}`
                      : t.configured}
                  </span>
                  {connection.lastErrorCode ? <code>{connection.lastErrorCode}</code> : null}
                </div>
                <form action="/api/integrations/github" method="post">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="operation" value="connection-validate" />
                  <input type="hidden" name="connectionId" value={connection.id} />
                  <button className="secondary-button" type="submit">
                    {t.validate}
                  </button>
                </form>
              </div>
            ))}
          </div>
        ) : connections ? (
          <p className="empty-state">{t.noConnections}</p>
        ) : null}
      </section>

      <section className="github-setup-section">
        <div className="github-setup-section-heading">
          <div>
            <h3>{t.repositories}</h3>
            <p>{t.repositoryHelp}</p>
          </div>
          <span>{repositories?.length ?? 0}</span>
        </div>

        {projects.length ? (
          <form className="github-repository-form" action="/api/integrations/github" method="post">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="operation" value="repository-create" />
            <label>
              <span>{t.project}</span>
              <select name="projectId" required defaultValue="">
                <option value="" disabled>
                  {t.project}
                </option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t.owner}</span>
              <input name="owner" maxLength={100} placeholder="Emmakex" required />
            </label>
            <label>
              <span>{t.repository}</span>
              <input name="repository" maxLength={100} placeholder="Kairoseth-Command-Center" required />
            </label>
            <label>
              <span>{t.defaultBranch}</span>
              <input name="defaultBranch" maxLength={255} placeholder="main" />
            </label>
            <button className="primary-button" type="submit">
              {t.addRepository}
            </button>
          </form>
        ) : (
          <p className="empty-state">{t.noProjects}</p>
        )}

        {repositories?.length ? (
          <div className="github-setup-list">
            {repositories.map((repository) => {
              const branch = metadataText(repository, 'defaultBranch');
              const latestCommit = metadataText(repository, 'latestCommitSha');
              return (
                <div className="github-setup-card github-repository-card" key={repository.id}>
                  <div className="github-setup-card-copy">
                    <div className="github-setup-title-row">
                      <a href={repository.url} target="_blank" rel="noreferrer noopener">
                        <strong>{repository.displayName}</strong>
                      </a>
                      <span className="github-project-label">
                        {repository.projectId
                          ? (projectNames.get(repository.projectId) ?? t.project)
                          : t.project}
                      </span>
                    </div>
                    <span>
                      {t.connection}:{' '}
                      {repository.connectionId
                        ? (connectionNames.get(repository.connectionId) ?? t.unbound)
                        : t.unbound}
                    </span>
                    <div className="github-repository-meta">
                      {branch ? <span>{`${t.branch}: ${branch}`}</span> : null}
                      {latestCommit ? <code>{`${t.lastCommit}: ${latestCommit.slice(0, 12)}`}</code> : null}
                    </div>
                  </div>
                  <div className="github-repository-actions">
                    {activeConnections.length ? (
                      <form className="github-bind-form" action="/api/integrations/github" method="post">
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="operation" value="repository-bind" />
                        <input type="hidden" name="resourceId" value={repository.id} />
                        <select
                          name="connectionId"
                          aria-label={t.connection}
                          defaultValue={repository.connectionId ?? activeConnections[0]?.id}
                          required
                        >
                          {activeConnections.map((connection) => (
                            <option key={connection.id} value={connection.id}>
                              {connection.displayName}
                            </option>
                          ))}
                        </select>
                        <button className="secondary-button" type="submit">
                          {t.bind}
                        </button>
                      </form>
                    ) : (
                      <span className="github-setup-hint">{t.noValidatedConnections}</span>
                    )}
                    <form action="/api/integrations/github" method="post">
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="operation" value="repository-sync" />
                      <input type="hidden" name="resourceId" value={repository.id} />
                      <button className="primary-button" type="submit" disabled={!repository.connectionId}>
                        {t.sync}
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        ) : repositories ? (
          <p className="empty-state">{t.noRepositories}</p>
        ) : null}
      </section>
    </article>
  );
}
