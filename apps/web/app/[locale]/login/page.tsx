import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession, readSessionToken } from '../../../lib/api';
import { dictionary, isLocale } from '../../../lib/i18n';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const token = await readSessionToken();
  if (token && (await getSession(token))) redirect(`/${locale}`);

  const { error } = await searchParams;
  const copy = dictionary[locale];
  const otherLocale = locale === 'es' ? 'en' : 'es';
  const errorMessage =
    error === 'credentials'
      ? copy.invalidCredentials
      : error === 'invalid'
        ? copy.invalidLogin
        : error === 'unavailable'
          ? copy.authUnavailable
          : null;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="eyebrow">{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p>{copy.loginSubtitle}</p>
        </div>

        <div className="auth-heading">
          <h2>{copy.loginTitle}</h2>
          <Link className="language-link" href={`/${otherLocale}/login`}>
            {copy.language}: {otherLocale.toUpperCase()}
          </Link>
        </div>

        {errorMessage ? <div className="auth-error">{errorMessage}</div> : null}

        <form className="auth-form" action="/api/auth/login" method="post">
          <input type="hidden" name="locale" value={locale} />
          <label>
            <span>{copy.email}</span>
            <input name="email" type="email" autoComplete="username" required maxLength={320} />
          </label>
          <label>
            <span>{copy.password}</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={1024}
            />
          </label>
          <button className="primary-button" type="submit">
            {copy.signIn}
          </button>
        </form>
      </section>
    </main>
  );
}
