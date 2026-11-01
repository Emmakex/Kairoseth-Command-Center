import { NextResponse } from 'next/server';

const SAME_ORIGIN_BASE = 'http://same-origin.invalid';

function assertSameOriginPath(value: string): void {
  if (!value.startsWith('/') || value.startsWith('//')) {
    throw new Error('same-origin redirect target must be an absolute path');
  }
}

/**
 * Build a mutable URL for a path-only redirect target.
 *
 * The synthetic origin is never emitted. `sameOriginRedirect` serializes only
 * pathname/search/hash into the Location header, keeping redirects bound to the
 * browser's current origin regardless of reverse-proxy topology.
 */
export function sameOriginUrl(pathname: string): URL {
  assertSameOriginPath(pathname);
  return new URL(pathname, SAME_ORIGIN_BASE);
}

/**
 * Return an HTTP redirect with a relative same-origin Location header.
 *
 * This deliberately avoids request.url and X-Forwarded-* origin reconstruction:
 * internal container hosts such as localhost:3000 can never leak into the browser,
 * and client/self-hosted deployments remain portable without public-domain config.
 */
export function sameOriginRedirect(target: URL | string, status = 303): NextResponse {
  const location =
    typeof target === 'string'
      ? target
      : `${target.pathname}${target.search}${target.hash}`;
  assertSameOriginPath(location);

  return new NextResponse(null, {
    status,
    headers: {
      location,
    },
  });
}
