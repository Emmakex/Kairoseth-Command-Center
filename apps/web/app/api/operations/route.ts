import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { apiBaseUrl, getSession, SESSION_COOKIE } from '../../../lib/api';
import { parseOperationalMutation } from '../../../lib/operations';
import { publicRequestUrl } from '../../../lib/public-url';

function localeValue(value: FormDataEntryValue | null): 'es' | 'en' {
  return value === 'en' ? 'en' : 'es';
}

function scopeValue(value: FormDataEntryValue | null): 'workspace' | 'private' {
  return value === 'private' ? 'private' : 'workspace';
}

function dashboardUrl(request: NextRequest, locale: 'es' | 'en', scope: 'workspace' | 'private', result: string) {
  const url = publicRequestUrl(request, `/${locale}`);
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
    return NextResponse.redirect(publicRequestUrl(request, '/es?result=invalid'), 303);
  }

  const locale = localeValue(form.get('locale'));
  const scope = scopeValue(form.get('scope'));
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.redirect(publicRequestUrl(request, `/${locale}/login`), 303);
  }

  let timeZone: string | undefined;
  if (form.get('operation') === 'task-reminders') {
    const session = await getSession(token);
    if (!session) {
      return NextResponse.redirect(dashboardUrl(request, locale, scope, 'error'), 303);
    }
    timeZone = session.user.timezone;
  }

  const mutation = parseOperationalMutation(form, { ...(timeZone ? { timeZone } : {}) });
  if (!mutation) {
    return NextResponse.redirect(dashboardUrl(request, locale, scope, 'invalid'), 303);
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
      return clearSession(NextResponse.redirect(publicRequestUrl(request, `/${locale}/login`), 303));
    }

    if (!response.ok) {
      const result = response.status === 403 ? 'forbidden' : response.status === 404 ? 'not-found' : 'error';
      return NextResponse.redirect(dashboardUrl(request, locale, scope, result), 303);
    }

    return NextResponse.redirect(dashboardUrl(request, locale, scope, 'saved'), 303);
  } catch {
    return NextResponse.redirect(dashboardUrl(request, locale, scope, 'error'), 303);
  }
}
