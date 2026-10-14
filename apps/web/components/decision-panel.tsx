import type { DecisionSummary, ProjectSummary } from '../lib/api';
import type { DictionaryCopy, Locale } from '../lib/i18n';

function formatDecisionDate(value: string, locale: Locale): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

export function DecisionPanel({
  locale,
  copy,
  projects,
  decisions,
}: {
  locale: Locale;
  copy: DictionaryCopy;
  projects: ProjectSummary[];
  decisions: DecisionSummary[] | null;
}) {
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const statuses: Record<string, string> = {
    active: copy.statusActive,
    superseded: copy.statusSuperseded,
    reversed: copy.statusReversed,
  };

  return (
    <article className="panel management-panel decisions-panel">
      <div className="panel-heading management-heading">
        <div>
          <h2>{copy.decisions}</h2>
          <p>{copy.decisionHelp}</p>
        </div>
        <span>{decisions?.length ?? 0}</span>
      </div>

      <form className="management-form decision-create-form" action="/api/operations" method="post">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="scope" value="workspace" />
        <input type="hidden" name="operation" value="decision-create" />
        <label className="field management-title-field">
          <span>{copy.titleLabel}</span>
          <input name="title" required maxLength={240} placeholder={copy.decisionTitlePlaceholder} />
        </label>
        <label className="field decision-context-field">
          <span>{copy.context}</span>
          <textarea name="context" rows={3} maxLength={8000} placeholder={copy.contextPlaceholder} />
        </label>
        <label className="field decision-body-field">
          <span>{copy.decision}</span>
          <textarea name="decision" rows={3} required maxLength={8000} placeholder={copy.decisionPlaceholder} />
        </label>
        <button className="primary-button decision-submit" type="submit">
          {copy.addDecision}
        </button>
      </form>

      <div className="decision-list">
        {decisions?.length ? (
          decisions.map((decision) => {
            const verifiedProjectName = decision.projectId ? projectNames.get(decision.projectId) : undefined;
            return (
              <section className="decision-card" key={decision.id}>
                <div className="decision-card-heading">
                  <div>
                    <strong>{decision.title}</strong>
                    <span>
                      {verifiedProjectName ?? copy.noProject} · {formatDecisionDate(decision.madeAt, locale)}
                    </span>
                  </div>
                  <span className={`decision-status decision-status-${decision.status}`}>
                    {statuses[decision.status] ?? decision.status}
                  </span>
                </div>
                {decision.context ? <p className="decision-context">{decision.context}</p> : null}
                <p className="decision-body">{decision.decision}</p>
              </section>
            );
          })
        ) : (
          <p className="empty-state">{copy.noDecisions}</p>
        )}
      </div>
    </article>
  );
}
