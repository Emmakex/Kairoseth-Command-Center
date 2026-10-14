import type { Locale } from '../lib/i18n';

export function AccountPanel({ locale }: { locale: Locale }) {
  const copy =
    locale === 'es'
      ? {
          title: 'Cuenta',
          help: 'Actualiza tu contraseña local. El cambio invalida las sesiones anteriores.',
          current: 'Contraseña actual',
          next: 'Nueva contraseña',
          action: 'Cambiar contraseña',
          warning: 'Después del cambio tendrás que iniciar sesión de nuevo.',
        }
      : {
          title: 'Account',
          help: 'Update your local password. The change invalidates previous sessions.',
          current: 'Current password',
          next: 'New password',
          action: 'Change password',
          warning: 'You will need to sign in again after changing it.',
        };

  return (
    <article className="panel management-panel account-panel">
      <div className="panel-heading management-heading">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.help}</p>
        </div>
      </div>
      <form className="management-form" action="/api/auth/local" method="post">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="operation" value="change-password" />
        <label className="field">
          <span>{copy.current}</span>
          <input name="currentPassword" type="password" autoComplete="current-password" required maxLength={1024} />
        </label>
        <label className="field">
          <span>{copy.next}</span>
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={1024}
            required
          />
        </label>
        <button className="primary-button" type="submit">
          {copy.action}
        </button>
      </form>
      <p className="management-note">{copy.warning}</p>
    </article>
  );
}
