import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { apiBaseUrl, SESSION_COOKIE } from '../../../../lib/api';
import { parseAutomationRulePolicyMutation } from '../../../../lib/automation-rule-policies';

function safeLocale(value: FormDataEntryValue | null): 'es' | 'en' {
  return value === 'en' ? 'en' : 'es';
}

function relativeRedirect(location: string) {
  return new NextResponse(null, {
    status: 303,
    headers: { location },
  });
}

function dashboardRedirect(locale: 'es' | 'en', result: string) {
  const params = new URLSearchParams({ scope: 'workspace', view: 'settings', result });
  return relativeRedirect(`/${locale}?${params.toString()}`);
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
    return relativeRedirect('/es?scope=workspace&view=settings&result=invalid');
  }

  const locale = safeLocale(form.get('locale'));
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return relativeRedirect(`/${locale}/login`);

  const mutation = parseAutomationRulePolicyMutation(form);
  if (!mutation) return dashboardRedirect(locale, 'invalid');

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
      return clearSession(relativeRedirect(`/${locale}/login`));
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
      return dashboardRedirect(locale, result);
    }

    return dashboardRedirect(locale, 'saved');
  } catch {
    return dashboardRedirect(locale, 'error');
  }
}
