import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { apiBaseUrl, SESSION_COOKIE } from '../../../../lib/api';
import { parsePrioritizationWeightPolicyMutation } from '../../../../lib/prioritization-weight-policies';
import { sameOriginRedirect, sameOriginUrl } from '../../../../lib/public-url';

function safeLocale(value: FormDataEntryValue | null): 'es' | 'en' {
  return value === 'en' ? 'en' : 'es';
}

function dashboardUrl(locale: 'es' | 'en', result: string) {
  const url = sameOriginUrl(`/${locale}`);
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
    return sameOriginRedirect('/es?scope=workspace&result=invalid');
  }

  const locale = safeLocale(form.get('locale'));
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return sameOriginRedirect(`/${locale}/login`);

  const mutation = parsePrioritizationWeightPolicyMutation(form);
  if (!mutation) return sameOriginRedirect(dashboardUrl(locale, 'invalid'));

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
      return clearSession(sameOriginRedirect(`/${locale}/login`));
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
      return sameOriginRedirect(dashboardUrl(locale, result));
    }

    return sameOriginRedirect(dashboardUrl(locale, 'saved'));
  } catch {
    return sameOriginRedirect(dashboardUrl(locale, 'error'));
  }
}
