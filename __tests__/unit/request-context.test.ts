import { describe, expect, it } from 'vitest';
import {
  RequestHeaderContextStore,
  buildRequestHeaderExtraInfoSpec,
  captureRequestHeaderContext,
} from '@/lib/download/request-context';

describe('request header context', () => {
  it('keeps only safe whitelisted request headers and extracts User-Agent separately', () => {
    const context = captureRequestHeaderContext({
      url: 'https://cdn.example.com/file.zip',
      now: 1000,
      requestHeaders: [
        { name: 'User-Agent', value: 'Browser/1.0' },
        { name: 'Accept', value: 'application/octet-stream' },
        { name: 'Accept-Language', value: 'en-US,en;q=0.9' },
        { name: 'Sec-Fetch-Site', value: 'same-origin' },
        { name: 'X-Custom-Token', value: 'secret' },
      ],
    });

    expect(context).toEqual({
      url: 'https://cdn.example.com/file.zip',
      createdAt: 1000,
      userAgent: 'Browser/1.0',
      requestHeaders: [
        { name: 'Accept', value: 'application/octet-stream' },
        { name: 'Accept-Language', value: 'en-US,en;q=0.9' },
        { name: 'Sec-Fetch-Site', value: 'same-origin' },
      ],
    });
  });

  it('captures Cookie separately and keeps it out of forwarded request headers', () => {
    const context = captureRequestHeaderContext({
      url: 'https://cdn.example.com/file.zip',
      requestHeaders: [
        { name: 'Host', value: 'cdn.example.com' },
        { name: 'Connection', value: 'keep-alive' },
        { name: 'Content-Length', value: '10' },
        { name: 'Transfer-Encoding', value: 'chunked' },
        { name: 'Range', value: 'bytes=0-' },
        { name: 'Proxy-Authorization', value: 'secret' },
        { name: 'If-None-Match', value: 'abc' },
        { name: 'Authorization', value: 'Bearer secret' },
        { name: 'Cookie', value: 'xf_session=abc; cf_clearance=ok' },
        { name: 'Accept', value: '*/*' },
      ],
    });

    expect(context?.requestHeaders).toEqual([{ name: 'Accept', value: '*/*' }]);
    expect(context?.cookie).toBe('xf_session=abc; cf_clearance=ok');
    expect(context?.userAgent).toBeUndefined();
  });

  it('removes CR and LF from captured values before caching', () => {
    const context = captureRequestHeaderContext({
      url: 'https://cdn.example.com/file.zip',
      requestHeaders: [
        { name: 'User-Agent', value: 'Browser\r\nInjected: 1' },
        { name: 'Origin', value: 'https://example.com\nInjected: 1' },
      ],
    });

    expect(context?.userAgent).toBe('Browser Injected: 1');
    expect(context?.requestHeaders).toEqual([
      { name: 'Origin', value: 'https://example.com Injected: 1' },
    ]);
  });

  it('returns null when no usable request context is present', () => {
    const context = captureRequestHeaderContext({
      url: 'https://cdn.example.com/file.zip',
      requestHeaders: [
        { name: 'Cookie', value: 'sid=secret' },
        { name: 'X-Internal', value: 'secret' },
      ],
    });

    expect(context).toEqual(
      expect.objectContaining({
        cookie: 'sid=secret',
      }),
    );
  });

  it('matches finalUrl before url and consumes the matched context', () => {
    let now = 1000;
    const store = new RequestHeaderContextStore(() => now, 30_000, 16);
    const original = captureRequestHeaderContext({
      url: 'https://origin.example.com/download',
      requestHeaders: [{ name: 'Accept', value: 'origin' }],
    });
    const final = captureRequestHeaderContext({
      url: 'https://cdn.example.com/file.zip',
      requestHeaders: [{ name: 'Accept', value: 'final' }],
    });

    expect(original).not.toBeNull();
    expect(final).not.toBeNull();
    store.remember(original!);
    store.remember(final!);

    const matched = store.match({
      url: 'https://origin.example.com/download',
      finalUrl: 'https://cdn.example.com/file.zip',
    });

    expect(matched).toEqual(
      expect.objectContaining({
        matched: true,
        reason: 'matched',
        source: 'finalUrl',
        ageMs: 0,
      }),
    );
    expect(matched.context?.requestHeaders).toEqual([{ name: 'Accept', value: 'final' }]);

    const secondMatch = store.match({
      url: 'https://origin.example.com/download',
      finalUrl: 'https://cdn.example.com/file.zip',
    });
    expect(secondMatch).toEqual(
      expect.objectContaining({
        matched: true,
        reason: 'matched',
        source: 'url',
      }),
    );
    expect(secondMatch.context).toEqual(original);

    now = 31_001;
    expect(store.match({ url: 'https://origin.example.com/download' })).toEqual({
      matched: false,
      reason: 'not-found',
    });
  });

  it('reports expired cached contexts by TTL without leaking header values', () => {
    let now = 1000;
    const store = new RequestHeaderContextStore(() => now, 100, 16);
    const context = captureRequestHeaderContext({
      url: 'https://cdn.example.com/file.zip',
      now,
      requestHeaders: [{ name: 'Accept', value: '*/*' }],
    });

    expect(context).not.toBeNull();
    store.remember(context!);
    now = 1101;

    expect(store.match({ url: 'https://cdn.example.com/file.zip' })).toEqual({
      matched: false,
      reason: 'expired',
    });
  });

  it('reports not-found when no cached context matches', () => {
    const store = new RequestHeaderContextStore(() => 1000, 30_000, 16);

    expect(store.match({ url: 'https://cdn.example.com/missing.zip' })).toEqual({
      matched: false,
      reason: 'not-found',
    });
  });

  it('uses extraHeaders only for Chromium request-header capture', () => {
    expect(buildRequestHeaderExtraInfoSpec('chromium')).toEqual(['requestHeaders', 'extraHeaders']);
    expect(buildRequestHeaderExtraInfoSpec('firefox')).toEqual(['requestHeaders']);
  });
});
