import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '../../../../lib/api';
import { publicRequestUrl } from '../../../../lib/public-url';

function safeLocale(value: string | null): 'es' | 'en' {
  return value === 'en' ? 'en' : 'es';
}

export async function POST(request: NextRequest) {
  const locale = safeLocale(request.nextUrl.searchParams.get('locale'));
  const response = NextResponse.redirect(publicRequestUrl(request, `/${locale}/login`), 303);
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  });
  return response;
}
