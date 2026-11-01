type RequestUrlSource = {
  url: string;
  headers: Pick<Headers, 'get'>;
};

function firstHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(',', 1)[0]?.trim();
  return first || null;
}

function forwardedProtocol(headers: RequestUrlSource['headers']): 'http:' | 'https:' | null {
  const value = firstHeaderValue(headers.get('x-forwarded-proto'))?.toLowerCase();
  return value === 'http' || value === 'https' ? `${value}:` : null;
}

function forwardedHost(headers: RequestUrlSource['headers']): string | null {
  const value = firstHeaderValue(headers.get('x-forwarded-host'));
  if (!value) return null;

  try {
    const parsed = new URL(`http://${value}`);
    if (parsed.host !== value || parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    return value;
  } catch {
    return null;
  }
}

/**
 * Build an absolute same-origin URL using the public reverse-proxy origin when present.
 *
 * Next.js can expose the internal container origin in `request.url` behind a reverse proxy
 * (for example `http://localhost:3000`). Caddy supplies the public origin through the
 * standard X-Forwarded-* headers, so redirects must prefer those values while preserving
 * a request-url fallback for local development and direct/self-hosted deployments.
 */
export function publicRequestUrl(request: RequestUrlSource, pathname: string): URL {
  const internalUrl = new URL(request.url);
  const host = forwardedHost(request.headers);
  if (!host) return new URL(pathname, internalUrl);

  const protocol = forwardedProtocol(request.headers) ?? internalUrl.protocol;
  return new URL(pathname, `${protocol}//${host}`);
}
