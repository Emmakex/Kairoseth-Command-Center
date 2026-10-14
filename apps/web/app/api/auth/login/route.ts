import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { apiBaseUrl, SESSION_COOKIE } from '../../../../lib/api';

function safeLocale(value: FormDataEntryValue | null): 'es' | 'en' {
  return value === 'en' ? 'en' : 'es';
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const locale = safeLocale(form.get('locale'));
  const email = typeof form.get('email') === 'string' ? String(form.get('email')) : '';
  const password = typeof form.get('password') === 'string' ? String(form.get('password')) : '';

  if (!email || !password) {
    return NextResponse.redirect(new URL(`/${locale}/login?error=invalid`, request.url), 303);
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
      return NextResponse.redirect(new URL(`/${locale}/login?error=${error}`, request.url), 303);
    }

    const body = (await response.json()) as { accessToken?: string; expiresAt?: string };
    if (!body.accessToken || !body.expiresAt) {
      return NextResponse.redirect(new URL(`/${locale}/login?error=unavailable`, request.url), 303);
    }

    const result = NextResponse.redirect(new URL(`/${locale}`, request.url), 303);
    result.cookies.set(SESSION_COOKIE, body.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: new Date(body.expiresAt),
    });
    return result;
  } catch {
    return NextResponse.redirect(new URL(`/${locale}/login?error=unavailable`, request.url), 303);
  }
}
