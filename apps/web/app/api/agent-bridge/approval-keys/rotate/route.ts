import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { apiBaseUrl, SESSION_COOKIE } from '../../../../../lib/api';
import { sameOriginRedirect, sameOriginUrl } from '../../../../../lib/public-url';

function safeLocale(value: FormDataEntryValue | null): 'es' | 'en' {
  return value === 'en' ? 'en' : 'es';
}

function agentBridgeUrl(locale: 'es' | 'en', result: string) {
  const url = sameOriginUrl(`/${locale}/ia/agent-bridge`);
  url.searchParams.set('rotation', result);
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
    return sameOriginRedirect(agentBridgeUrl('es', 'invalid'));
  }

  const locale = safeLocale(form.get('locale'));
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return sameOriginRedirect(`/${locale}/login`);

  try {
    const response = await fetch(`${apiBaseUrl()}/v1/products/agent-bridge/approval-keys/rotate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 401) {
      return clearSession(sameOriginRedirect(`/${locale}/login`));
    }

    if (!response.ok) {
      const result =
        response.status === 403
          ? 'forbidden'
          : response.status === 409
            ? 'conflict'
            : response.status === 503
              ? 'unavailable'
              : 'error';
      return sameOriginRedirect(agentBridgeUrl(locale, result));
    }

    return sameOriginRedirect(agentBridgeUrl(locale, 'started'));
  } catch {
    return sameOriginRedirect(agentBridgeUrl(locale, 'error'));
  }
}
