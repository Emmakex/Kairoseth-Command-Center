import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { apiBaseUrl, SESSION_COOKIE } from '../../../../lib/api';
import { sealGitHubWebhookSecret } from '../../../../lib/github-webhook-secret';
import { parseGitHubSetupMutation } from '../../../../lib/github-setup';
import { publicRequestUrl } from '../../../../lib/public-url';

const WEBHOOK_REVEAL_COOKIE = 'kcc_github_webhook_reveal';

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

function webhookRevealResponse(
  request: NextRequest,
  locale: 'es' | 'en',
  sessionToken: string,
  payload: unknown,
): NextResponse | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as { webhook?: unknown; secret?: unknown };
  if (!body.webhook || typeof body.webhook !== 'object' || typeof body.secret !== 'string') {
    return null;
  }
  const path = (body.webhook as { path?: unknown }).path;
  if (typeof path !== 'string') return null;
  const sealed = sealGitHubWebhookSecret(sessionToken, { path, secret: body.secret });
  if (!sealed) return null;

  const url = publicRequestUrl(request, '/api/integrations/github/webhook-secret');
  url.searchParams.set('locale', locale);
  const response = NextResponse.redirect(url, 303);
  response.cookies.set(WEBHOOK_REVEAL_COOKIE, sealed, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/integrations/github/webhook-secret',
    maxAge: 120,
  });
  response.headers.set('cache-control', 'no-store, private');
  response.headers.set('referrer-policy', 'no-referrer');
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

  const mutation = parseGitHubSetupMutation(form);
  if (!mutation) return NextResponse.redirect(dashboardUrl(request, locale, 'invalid'), 303);

  try {
    const response = await fetch(`${apiBaseUrl()}${mutation.path}`, {
      method: mutation.method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(mutation.body ? { 'content-type': 'application/json' } : {}),
      },
      ...(mutation.body ? { body: JSON.stringify(mutation.body) } : {}),
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

    if (mutation.revealWebhookSecret) {
      const payload = (await response.json()) as unknown;
      const reveal = webhookRevealResponse(request, locale, token, payload);
      return reveal ?? NextResponse.redirect(dashboardUrl(request, locale, 'error'), 303);
    }

    return NextResponse.redirect(dashboardUrl(request, locale, 'saved'), 303);
  } catch {
    return NextResponse.redirect(dashboardUrl(request, locale, 'error'), 303);
  }
}
