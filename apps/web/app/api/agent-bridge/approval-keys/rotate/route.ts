import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { apiBaseUrl, SESSION_COOKIE } from '../../../../../../lib/api';

function safeLocale(value: FormDataEntryValue | null): 'es' | 'en' {
  return value === 'en' ? 'en' : 'es';
}

function agentBridgeUrl(request: NextRequest, locale: 'es' | 'en', result: string) {
  const url = new URL(`/${locale}/ia/agent-bridge`, request.url);
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
    return NextResponse.redirect(agentBridgeUrl(request, 'es', 'invalid'), 303);
  }

  const locale = safeLocale(form.get('locale'));
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.redirect(new URL(`/${locale}/login`, request.url), 303);

  try {
    const response = await fetch(`${apiBaseUrl()}/v1/products/agent-bridge/approval-keys/rotate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 401) {
      return clearSession(NextResponse.redirect(new URL(`/${locale}/login`, request.url), 303));
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
      return NextResponse.redirect(agentBridgeUrl(request, locale, result), 303);
    }

    return NextResponse.redirect(agentBridgeUrl(request, locale, 'started'), 303);
  } catch {
    return NextResponse.redirect(agentBridgeUrl(request, locale, 'error'), 303);
  }
}
