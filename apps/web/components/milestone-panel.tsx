import type { MilestoneSummary, ProjectSummary } from '../lib/api';
import type { DictionaryCopy, Locale } from '../lib/i18n';

export function MilestonePanel({
  locale,
  scope,
  copy,
  projects,
  milestones,
}: {
  locale: Locale;
  scope: 'workspace' | 'private';
  copy: DictionaryCopy;
  projects: ProjectSummary[];
  milestones: MilestoneSummary[] | null;
}) {
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const statuses: Record<string, string> = {
    planned: copy.statusPlanned,
    active: copy.statusActive,
    done: copy.statusDone,
    cancelled: copy.statusCancelled,
  };

  return (
    <article className="panel management-panel">
      <div className="panel-heading management-heading">
        <div>
          <h2>{copy.milestones}</h2>
          <p>{copy.milestoneHelp}</p>
        </div>
        <span>{milestones?.length ?? 0}</span>
      </div>

      <form className="management-form milestone-create-form" action="/api/operations" method="post">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="operation" value="milestone-create" />
        <label className="field">
          <span>{copy.linkedProject}</span>
          <select name="projectId" required defaultValue="" disabled={projects.length === 0}>
            <option value="" disabled>
              {copy.linkedProject}
            </option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field management-title-field">
          <span>{copy.titleLabel}</span>
          <input name="title" required maxLength={240} placeholder={copy.milestoneTitlePlaceholder} />
        </label>
        <label className="field compact-field">
          <span>
            {copy.weight} · {copy.weightHelp}
          </span>
          <input name="weight" type="number" min="1" max="100" defaultValue="25" required />
        </label>
        <button className="primary-button" type="submit" disabled={projects.length === 0}>
          {copy.addMilestone}
        </button>
      </form>

      <div className="item-list management-list">
        {milestones?.length ? (
          milestones.map((milestone) => (
            <div className="item-row item-row-manage" key={milestone.id}>
              <div className="item-copy">
                <strong>{milestone.title}</strong>
                <span>
                  {projectNames.get(milestone.projectId) ?? milestone.projectId} · {copy.weight} {milestone.weight} ·{' '}
                  {statuses[milestone.status] ?? milestone.status}
                </span>
              </div>
              <form className="inline-operation milestone-operation" action="/api/operations" method="post">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="scope" value={scope} />
                <input type="hidden" name="operation" value="milestone-status" />
                <input type="hidden" name="id" value={milestone.id} />
                <label>
                  <span>{copy.statusLabel}</span>
                  <select name="status" defaultValue={milestone.status}>
                    <option value="planned">{copy.statusPlanned}</option>
                    <option value="active">{copy.statusActive}</option>
                    <option value="done">{copy.statusDone}</option>
                    <option value="cancelled">{copy.statusCancelled}</option>
                  </select>
                </label>
                <button className="secondary-button" type="submit">
                  {copy.save}
                </button>
              </form>
            </div>
          ))
        ) : (
          <p className="empty-state">{copy.noMilestones}</p>
        )}
      </div>
    </article>
  );
}
