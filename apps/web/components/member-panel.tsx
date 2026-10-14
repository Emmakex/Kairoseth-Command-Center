import type { DictionaryCopy, Locale } from '../lib/i18n';
import type { LocalMember } from '../lib/local-identities';

export function MemberPanel({
  locale,
  copy,
  members,
}: {
  locale: Locale;
  copy: DictionaryCopy;
  members: LocalMember[] | null;
}) {
  const roleLabel = (role: LocalMember['role']) =>
    role === 'owner' ? copy.roleOwner : role === 'admin' ? copy.roleAdmin : copy.roleMember;
  const statusLabel = (status: LocalMember['status']) =>
    status === 'active'
      ? copy.memberStatusActive
      : status === 'suspended'
        ? copy.memberStatusSuspended
        : copy.memberStatusDisabled;

  return (
    <article className="panel management-panel members-panel">
      <div className="panel-heading management-heading">
        <div>
          <h2>{copy.members}</h2>
          <p>{copy.membersHelp}</p>
        </div>
        <span>{members?.length ?? 0}</span>
      </div>

      <form className="management-form member-create-form" action="/api/auth/local" method="post">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="operation" value="member-create" />
        <label className="field">
          <span>{copy.displayName}</span>
          <input name="displayName" required maxLength={160} />
        </label>
        <label className="field">
          <span>{copy.email}</span>
          <input name="email" type="email" required maxLength={320} autoComplete="off" />
        </label>
        <label className="field compact-field">
          <span>{copy.role}</span>
          <select name="role" defaultValue="member">
            <option value="member">{copy.roleMember}</option>
            <option value="admin">{copy.roleAdmin}</option>
          </select>
        </label>
        <label className="field compact-field">
          <span>{copy.language}</span>
          <select name="memberLocale" defaultValue={locale}>
            <option value="es">ES</option>
            <option value="en">EN</option>
          </select>
        </label>
        <label className="field">
          <span>{copy.timezone}</span>
          <input name="timezone" required maxLength={120} defaultValue="Europe/Madrid" />
        </label>
        <label className="field">
          <span>{copy.initialPassword}</span>
          <input name="password" type="password" minLength={12} maxLength={1024} required autoComplete="new-password" />
        </label>
        <button className="primary-button" type="submit">
          {copy.addMember}
        </button>
      </form>

      <div className="item-list management-list">
        {members?.length ? (
          members.map((member) => (
            <div className="item-row item-row-manage member-row" key={member.id}>
              <div className="item-copy">
                <strong>{member.displayName}</strong>
                <span>
                  {member.email} · {roleLabel(member.role)} · {statusLabel(member.status)}
                </span>
              </div>
              {member.role === 'owner' ? (
                <span className="timeline-status">{copy.ownerProtected}</span>
              ) : (
                <div className="member-actions">
                  <form className="inline-operation" action="/api/auth/local" method="post">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="operation" value="member-update" />
                    <input type="hidden" name="userId" value={member.id} />
                    <label>
                      <span>{copy.role}</span>
                      <select name="role" defaultValue={member.role}>
                        <option value="member">{copy.roleMember}</option>
                        <option value="admin">{copy.roleAdmin}</option>
                      </select>
                    </label>
                    <label>
                      <span>{copy.statusLabel}</span>
                      <select name="status" defaultValue={member.status}>
                        <option value="active">{copy.memberStatusActive}</option>
                        <option value="suspended">{copy.memberStatusSuspended}</option>
                        <option value="disabled">{copy.memberStatusDisabled}</option>
                      </select>
                    </label>
                    <button className="secondary-button" type="submit">
                      {copy.save}
                    </button>
                  </form>
                  <form className="inline-operation member-password-reset" action="/api/auth/local" method="post">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="operation" value="member-reset-password" />
                    <input type="hidden" name="userId" value={member.id} />
                    <label>
                      <span>{copy.resetPassword}</span>
                      <input name="newPassword" type="password" minLength={12} maxLength={1024} required autoComplete="new-password" />
                    </label>
                    <button className="secondary-button" type="submit">
                      {copy.reset}
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="empty-state">{copy.noMembers}</p>
        )}
      </div>
    </article>
  );
}
