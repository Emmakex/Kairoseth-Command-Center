import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { apiBaseUrl, SESSION_COOKIE } from '../../../../lib/api';
import { publicRequestUrl } from '../../../../lib/public-url';

function localeValue(value: FormDataEntryValue | null): 'es' | 'en' {
  return value === 'en' ? 'en' : 'es';
}

function dashboardUrl(request: NextRequest, locale: 'es' | 'en', result: string) {
  const url = publicRequestUrl(request, `/${locale}`);
  url.searchParams.set('scope', 'workspace');
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

function stringValue(form: FormData, name: string, maxLength: number): string | null {
  const value = form.get(name);
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.redirect(publicRequestUrl(request, '/es?scope=workspace&result=invalid'), 303);
  }

  const locale = localeValue(form.get('locale'));
  const operation = form.get('operation');
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.redirect(publicRequestUrl(request, `/${locale}/login`), 303);

  let path: string;
  let method: 'POST' | 'PATCH' = 'POST';
  let body: Record<string, unknown>;
  let invalidateCurrentSession = false;

  if (operation === 'change-password') {
    const currentPassword = stringValue(form, 'currentPassword', 1024);
    const newPassword = stringValue(form, 'newPassword', 1024);
    if (!currentPassword || !newPassword || newPassword.length < 12) {
      return NextResponse.redirect(dashboardUrl(request, locale, 'invalid'), 303);
    }
    path = '/v1/auth/local/change-password';
    body = { currentPassword, newPassword };
    invalidateCurrentSession = true;
  } else if (operation === 'member-create') {
    const email = stringValue(form, 'email', 320);
    const displayName = stringValue(form, 'displayName', 160);
    const timezone = stringValue(form, 'timezone', 120);
    const password = stringValue(form, 'password', 1024);
    const role = form.get('role');
    const memberLocale = form.get('memberLocale');
    if (
      !email ||
      !displayName ||
      !timezone ||
      !password ||
      password.length < 12 ||
      (role !== 'admin' && role !== 'member') ||
      (memberLocale !== 'es' && memberLocale !== 'en')
    ) {
      return NextResponse.redirect(dashboardUrl(request, locale, 'invalid'), 303);
    }
    path = '/v1/auth/local/members';
    body = { email, displayName, timezone, password, role, locale: memberLocale };
  } else if (operation === 'member-update') {
    const userId = stringValue(form, 'userId', 160);
    const role = form.get('role');
    const status = form.get('status');
    if (
      !userId ||
      (role !== 'admin' && role !== 'member') ||
      (status !== 'active' && status !== 'suspended' && status !== 'disabled')
    ) {
      return NextResponse.redirect(dashboardUrl(request, locale, 'invalid'), 303);
    }
    path = `/v1/auth/local/members/${encodeURIComponent(userId)}`;
    method = 'PATCH';
    body = { role, status };
  } else if (operation === 'member-reset-password') {
    const userId = stringValue(form, 'userId', 160);
    const newPassword = stringValue(form, 'newPassword', 1024);
    if (!userId || !newPassword || newPassword.length < 12) {
      return NextResponse.redirect(dashboardUrl(request, locale, 'invalid'), 303);
    }
    path = `/v1/auth/local/members/${encodeURIComponent(userId)}/reset-password`;
    body = { newPassword };
  } else {
    return NextResponse.redirect(dashboardUrl(request, locale, 'invalid'), 303);
  }

  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 401 && !invalidateCurrentSession) {
      return clearSession(NextResponse.redirect(publicRequestUrl(request, `/${locale}/login`), 303));
    }
    if (!response.ok) {
      const result =
        response.status === 403
          ? 'forbidden'
          : response.status === 404
            ? 'not-found'
            : response.status === 409
              ? 'conflict'
              : 'error';
      return NextResponse.redirect(dashboardUrl(request, locale, result), 303);
    }

    if (invalidateCurrentSession) {
      return clearSession(
        NextResponse.redirect(publicRequestUrl(request, `/${locale}/login?password=changed`), 303),
      );
    }
    return NextResponse.redirect(dashboardUrl(request, locale, 'saved'), 303);
  } catch {
    return NextResponse.redirect(dashboardUrl(request, locale, 'error'), 303);
  }
}
