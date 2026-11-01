import { describe, expect, it } from 'vitest';
import { sameOriginRedirect, sameOriginUrl } from '../lib/public-url';

describe('same-origin redirects', () => {
  it('emits a relative Location so internal localhost origins cannot leak', () => {
    const response = sameOriginRedirect('/es?scope=private&result=saved');

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/es?scope=private&result=saved');
  });

  it('supports mutable query parameters without emitting the synthetic origin', () => {
    const url = sameOriginUrl('/en');
    url.searchParams.set('scope', 'workspace');
    url.searchParams.set('result', 'saved');

    expect(sameOriginRedirect(url).headers.get('location')).toBe(
      '/en?scope=workspace&result=saved',
    );
  });

  it('preserves hash fragments when serializing URL targets', () => {
    expect(sameOriginRedirect(sameOriginUrl('/es#today')).headers.get('location')).toBe(
      '/es#today',
    );
  });

  it('rejects protocol-relative and absolute external targets', () => {
    expect(() => sameOriginRedirect('//evil.example/path')).toThrow();
    expect(() => sameOriginRedirect('https://evil.example/path')).toThrow();
  });
});
