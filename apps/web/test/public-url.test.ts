import { describe, expect, it } from 'vitest';
import { publicRequestUrl } from '../lib/public-url';

function request(url: string, headers: Record<string, string> = {}) {
  return {
    url,
    headers: new Headers(headers),
  };
}

describe('publicRequestUrl', () => {
  it('uses the public proxy origin instead of an internal localhost origin', () => {
    const url = publicRequestUrl(
      request('http://localhost:3000/api/operations', {
        'x-forwarded-host': 'work-manager.kairoseth.com',
        'x-forwarded-proto': 'https',
      }),
      '/es?scope=private&result=saved',
    );

    expect(url.toString()).toBe(
      'https://work-manager.kairoseth.com/es?scope=private&result=saved',
    );
  });

  it('uses the first proxy hop value when forwarded headers contain a chain', () => {
    const url = publicRequestUrl(
      request('http://localhost:3000/api/operations', {
        'x-forwarded-host': 'client.example.com, internal.example.local',
        'x-forwarded-proto': 'https, http',
      }),
      '/en',
    );

    expect(url.toString()).toBe('https://client.example.com/en');
  });

  it('falls back to request.url for direct local development', () => {
    expect(publicRequestUrl(request('http://localhost:3000/api/operations'), '/es').toString()).toBe(
      'http://localhost:3000/es',
    );
  });

  it('ignores malformed forwarded hosts', () => {
    expect(
      publicRequestUrl(
        request('http://localhost:3000/api/operations', {
          'x-forwarded-host': 'example.com/path',
          'x-forwarded-proto': 'https',
        }),
        '/es',
      ).toString(),
    ).toBe('http://localhost:3000/es');
  });
});
