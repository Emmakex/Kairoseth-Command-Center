import type { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { apiBaseUrl, getSession, SESSION_COOKIE } from '../../../lib/api';
import { parseOperationalMutation } from '../../../lib/operations';
import { sameOriginRedirect, sameOriginUrl } from '../../../lib/public-url';

function localeValue(value: FormDataEntryValue | null): 'es' | 'en' {
  return value === 'en' ? 'en' : 'es';
}

function scopeValue(value: FormDataEntryValue | null): 'workspace' | 'private' {
  return value === 'private' ? 'private' : 'workspace';
}

function dashboardUrl(locale: 'es' | 'en', scope: 'workspace' | 'private', result: string) {
  const url = sameOriginUrl(`/${locale}`);
  url.searchParams.set('scope', scope);
  url.searchParams.set('result', result);
  return url;
}

function clearSession(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  });
  return response;
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return sameOriginRedirect('/es?result=invalid');
  }

  const locale = localeValue(form.get('locale'));
  const scope = scopeValue(form.get('scope'));
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return sameOriginRedirect(`/${locale}/login`);
  }

  let timeZone: string | undefined;
  if (form.get('operation') === 'task-reminders') {
    const session = await getSession(token);
    if (!session) {
      return sameOriginRedirect(dashboardUrl(locale, scope, 'error'));
    }
    timeZone = session.user.timezone;
  }

  const mutation = parseOperationalMutation(form, { ...(timeZone ? { timeZone } : {}) });
  if (!mutation) {
    return sameOriginRedirect(dashboardUrl(locale, scope, 'invalid'));
  }

  try {
    const response = await fetch(`${apiBaseUrl()}${mutation.path}`, {
      method: mutation.method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(mutation.body),
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });

    if (response.status === 401) {
      return clearSession(sameOriginRedirect(`/${locale}/login`));
    }

    if (!response.ok) {
      const result = response.status === 403 ? 'forbidden' : response.status === 404 ? 'not-found' : 'error';
      return sameOriginRedirect(dashboardUrl(locale, scope, result));
    }

    return sameOriginRedirect(dashboardUrl(locale, scope, 'saved'));
  } catch {
    return sameOriginRedirect(dashboardUrl(locale, scope, 'error'));
  }
}
