import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '../../../../../lib/api';
import {
  renderGitHubWebhookSecretHtml,
  unsealGitHubWebhookSecret,
} from '../../../../../lib/github-webhook-secret';
import { sameOriginRedirect, sameOriginUrl } from '../../../../../lib/public-url';

const WEBHOOK_REVEAL_COOKIE = 'kcc_github_webhook_reveal';

function localeFrom(request: NextRequest): 'es' | 'en' {
  return request.nextUrl.searchParams.get('locale') === 'en' ? 'en' : 'es';
}

function clearRevealCookie(response: NextResponse): NextResponse {
  response.cookies.set(WEBHOOK_REVEAL_COOKIE, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/integrations/github/webhook-secret',
    expires: new Date(0),
  });
  return response;
}

export async function GET(request: NextRequest) {
  const locale = localeFrom(request);
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return clearRevealCookie(sameOriginRedirect(`/${locale}/login`));
  }

  const sealed = request.cookies.get(WEBHOOK_REVEAL_COOKIE)?.value;
  const reveal = sealed ? unsealGitHubWebhookSecret(sessionToken, sealed) : null;
  if (!reveal) {
    const url = sameOriginUrl(`/${locale}`);
    url.searchParams.set('scope', 'workspace');
    url.searchParams.set('result', 'error');
    return clearRevealCookie(sameOriginRedirect(url));
  }

  const response = new NextResponse(renderGitHubWebhookSecretHtml(locale, reveal), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, private',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    },
  });
  return clearRevealCookie(response);
}
