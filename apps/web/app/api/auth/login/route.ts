import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { apiBaseUrl, SESSION_COOKIE } from '../../../../lib/api';

function safeLocale(value: FormDataEntryValue | null): 'es' | 'en' {
  return value === 'en' ? 'en' : 'es';
}

function relativeRedirect(location: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { location },
  });
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const locale = safeLocale(form.get('locale'));
  const email = typeof form.get('email') === 'string' ? String(form.get('email')) : '';
  const password = typeof form.get('password') === 'string' ? String(form.get('password')) : '';

  if (!email || !password) {
    return relativeRedirect(`/${locale}/login?error=invalid`);
  }

  try {
    const response = await fetch(`${apiBaseUrl()}/v1/auth/local/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const error = response.status === 401 ? 'credentials' : 'unavailable';
      return relativeRedirect(`/${locale}/login?error=${error}`);
    }

    const body = (await response.json()) as { accessToken?: string; expiresAt?: string };
    if (!body.accessToken || !body.expiresAt) {
      return relativeRedirect(`/${locale}/login?error=unavailable`);
    }

    const result = relativeRedirect(`/${locale}`);
    result.cookies.set(SESSION_COOKIE, body.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: new Date(body.expiresAt),
    });
    return result;
  } catch {
    return relativeRedirect(`/${locale}/login?error=unavailable`);
  }
}
