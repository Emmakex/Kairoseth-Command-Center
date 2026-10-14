import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '../../../../lib/api';

function safeLocale(value: string | null): 'es' | 'en' {
  return value === 'en' ? 'en' : 'es';
}

export async function POST(request: NextRequest) {
  const locale = safeLocale(request.nextUrl.searchParams.get('locale'));
  const response = NextResponse.redirect(new URL(`/${locale}/login`, request.url), 303);
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  });
  return response;
}
