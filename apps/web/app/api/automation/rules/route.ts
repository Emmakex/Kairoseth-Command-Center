import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { apiBaseUrl, SESSION_COOKIE } from '../../../../lib/api';
import { parseAutomationRulePolicyMutation } from '../../../../lib/automation-rule-policies';
import { publicRequestUrl } from '../../../../lib/public-url';

function safeLocale(value: FormDataEntryValue | null): 'es' | 'en' {
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

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.redirect(publicRequestUrl(request, '/es?scope=workspace&result=invalid'), 303);
  }

  const locale = safeLocale(form.get('locale'));
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.redirect(publicRequestUrl(request, `/${locale}/login`), 303);

  const mutation = parseAutomationRulePolicyMutation(form);
  if (!mutation) return NextResponse.redirect(dashboardUrl(request, locale, 'invalid'), 303);

  try {
    const response = await fetch(`${apiBaseUrl()}${mutation.path}`, {
      method: mutation.method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(mutation.body),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 401) {
      return clearSession(NextResponse.redirect(publicRequestUrl(request, `/${locale}/login`), 303));
    }
    if (!response.ok) {
      const result =
        response.status === 400
          ? 'invalid'
          : response.status === 403
            ? 'forbidden'
            : response.status === 404
              ? 'not-found'
              : response.status === 409
                ? 'conflict'
                : 'error';
      return NextResponse.redirect(dashboardUrl(request, locale, result), 303);
    }

    return NextResponse.redirect(dashboardUrl(request, locale, 'saved'), 303);
  } catch {
    return NextResponse.redirect(dashboardUrl(request, locale, 'error'), 303);
  }
}
