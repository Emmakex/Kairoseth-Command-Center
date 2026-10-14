import type { DictionaryCopy, Locale } from '../lib/i18n';

export function AccountPanel({ locale, copy }: { locale: Locale; copy: DictionaryCopy }) {
  return (
    <article className="panel management-panel account-panel">
      <div className="panel-heading management-heading">
        <div>
          <h2>{copy.account}</h2>
          <p>{copy.accountHelp}</p>
        </div>
      </div>
      <form className="management-form" action="/api/auth/local" method="post">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="operation" value="change-password" />
        <label className="field">
          <span>{copy.currentPassword}</span>
          <input name="currentPassword" type="password" autoComplete="current-password" required maxLength={1024} />
        </label>
        <label className="field">
          <span>{copy.newPassword}</span>
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
          {copy.changePassword}
        </button>
      </form>
      <p className="management-note">{copy.passwordSessionWarning}</p>
    </article>
  );
}
