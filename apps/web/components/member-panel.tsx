import type { Locale } from '../lib/i18n';
import type { LocalMember } from '../lib/local-identities';

export function MemberPanel({
  locale,
  members,
}: {
  locale: Locale;
  members: LocalMember[] | null;
}) {
  const copy =
    locale === 'es'
      ? {
          title: 'Miembros',
          help: 'Administra usuarios locales, roles, estado y restablecimiento de contraseña.',
          name: 'Nombre',
          email: 'Correo electrónico',
          role: 'Rol',
          language: 'Idioma',
          timezone: 'Zona horaria',
          initialPassword: 'Contraseña inicial',
          add: 'Añadir miembro',
          owner: 'Propietario',
          admin: 'Administrador',
          member: 'Miembro',
          status: 'Estado',
          active: 'Activo',
          suspended: 'Suspendido',
          disabled: 'Deshabilitado',
          save: 'Guardar',
          resetPassword: 'Nueva contraseña',
          reset: 'Restablecer',
          ownerProtected: 'Propietario protegido',
          empty: 'No hay miembros disponibles.',
        }
      : {
          title: 'Members',
          help: 'Manage local users, roles, status and password resets.',
          name: 'Name',
          email: 'Email',
          role: 'Role',
          language: 'Language',
          timezone: 'Timezone',
          initialPassword: 'Initial password',
          add: 'Add member',
          owner: 'Owner',
          admin: 'Admin',
          member: 'Member',
          status: 'Status',
          active: 'Active',
          suspended: 'Suspended',
          disabled: 'Disabled',
          save: 'Save',
          resetPassword: 'New password',
          reset: 'Reset',
          ownerProtected: 'Protected owner',
          empty: 'No members available.',
        };
  const roleLabel = (role: LocalMember['role']) =>
    role === 'owner' ? copy.owner : role === 'admin' ? copy.admin : copy.member;
  const statusLabel = (status: LocalMember['status']) =>
    status === 'active' ? copy.active : status === 'suspended' ? copy.suspended : copy.disabled;

  return (
    <article className="panel management-panel members-panel">
      <div className="panel-heading management-heading">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.help}</p>
        </div>
        <span>{members?.length ?? 0}</span>
      </div>

      <form className="management-form member-create-form" action="/api/auth/local" method="post">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="operation" value="member-create" />
        <label className="field">
          <span>{copy.name}</span>
          <input name="displayName" required maxLength={160} />
        </label>
        <label className="field">
          <span>{copy.email}</span>
          <input name="email" type="email" required maxLength={320} autoComplete="off" />
        </label>
        <label className="field compact-field">
          <span>{copy.role}</span>
          <select name="role" defaultValue="member">
            <option value="member">{copy.member}</option>
            <option value="admin">{copy.admin}</option>
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
          {copy.add}
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
                        <option value="member">{copy.member}</option>
                        <option value="admin">{copy.admin}</option>
                      </select>
                    </label>
                    <label>
                      <span>{copy.status}</span>
                      <select name="status" defaultValue={member.status}>
                        <option value="active">{copy.active}</option>
                        <option value="suspended">{copy.suspended}</option>
                        <option value="disabled">{copy.disabled}</option>
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
          <p className="empty-state">{copy.empty}</p>
        )}
      </div>
    </article>
  );
}
