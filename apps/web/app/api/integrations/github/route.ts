import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { apiBaseUrl, SESSION_COOKIE } from '../../../../lib/api';
import { sealGitHubWebhookSecret } from '../../../../lib/github-webhook-secret';
import { parseGitHubSetupMutation } from '../../../../lib/github-setup';

const WEBHOOK_REVEAL_COOKIE = 'kcc_github_webhook_reveal';

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

function webhookRevealResponse(
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

  const response = relativeRedirect(`/api/integrations/github/webhook-secret?locale=${locale}`);
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
    return relativeRedirect('/es?scope=workspace&view=settings&result=invalid');
  }

  const locale = safeLocale(form.get('locale'));
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return relativeRedirect(`/${locale}/login`);

  const mutation = parseGitHubSetupMutation(form);
  if (!mutation) return dashboardRedirect(locale, 'invalid');

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

    if (mutation.revealWebhookSecret) {
      const payload = (await response.json()) as unknown;
      const reveal = webhookRevealResponse(locale, token, payload);
      return reveal ?? dashboardRedirect(locale, 'error');
    }

    return dashboardRedirect(locale, 'saved');
  } catch {
    return dashboardRedirect(locale, 'error');
  }
}
