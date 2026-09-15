import { describe, expect, it } from 'vitest';
import {
  RequestHeaderContextStore,
  buildRequestHeaderExtraInfoSpec,
  captureRequestHeaderContext,
} from '@/lib/download/request-context';

describe('request header context', () => {
  it('separates Cookie and User-Agent while forwarding only sanitized allowlisted headers', () => {
    const context = captureRequestHeaderContext({
      url: 'https://cdn.example.com/file.zip',
      now: 1000,
      requestHeaders: [
        { name: 'Cookie', value: 'session=secret' },
        { name: 'User-Agent', value: 'Browser\r\nInjected: 1' },
        { name: 'Accept', value: 'application/zip' },
        { name: 'Origin', value: 'https://example.com\nInjected: 1' },
        { name: 'Authorization', value: 'Bearer secret' },
        { name: 'Accept-Encoding', value: 'gzip' },
        { name: 'X-Custom-Token', value: 'secret' },
      ],
    });

    expect(context).toEqual({
      url: 'https://cdn.example.com/file.zip',
      createdAt: 1000,
      cookie: 'session=secret',
      userAgent: 'Browser Injected: 1',
      requestHeaders: [
        { name: 'Accept', value: 'application/zip' },
        { name: 'Origin', value: 'https://example.com Injected: 1' },
      ],
    });
  });

  it('prefers final URLs, consumes matches, and preserves peeks', () => {
    const store = new RequestHeaderContextStore(() => 1000, 30_000, 16);
    const original = captureRequestHeaderContext({
      url: 'https://origin.example.com/download',
      requestHeaders: [{ name: 'Accept', value: 'origin' }],
    });
    const final = captureRequestHeaderContext({
      url: 'https://cdn.example.com/file.zip',
      requestHeaders: [{ name: 'Accept', value: 'final' }],
    });
    if (!original || !final) throw new Error('fixture capture failed');
    store.remember(original);
    store.remember(final);

    expect(store.peek({ url: original.url, finalUrl: final.url })).toMatchObject({
      matched: true,
      source: 'finalUrl',
      context: final,
    });
    expect(store.match({ url: original.url, finalUrl: final.url })).toMatchObject({
      matched: true,
      source: 'finalUrl',
      context: final,
    });
    expect(store.match({ url: original.url, finalUrl: final.url })).toMatchObject({
      matched: true,
      source: 'url',
      context: original,
    });
  });

  it('distinguishes expired and missing contexts without exposing values', () => {
    let now = 1000;
    const store = new RequestHeaderContextStore(() => now, 100, 16);
    const context = captureRequestHeaderContext({
      url: 'https://cdn.example.com/file.zip',
      now,
      requestHeaders: [{ name: 'Accept', value: 'secret-value' }],
    });
    if (!context) throw new Error('fixture capture failed');
    store.remember(context);
    now = 1101;

    expect(store.match({ url: context.url })).toEqual({ matched: false, reason: 'expired' });
    expect(store.match({ url: 'https://example.com/missing' })).toEqual({
      matched: false,
      reason: 'not-found',
    });
  });

  it('requests extra header access only on Chromium', () => {
    expect(buildRequestHeaderExtraInfoSpec('chromium')).toEqual(['requestHeaders', 'extraHeaders']);
    expect(buildRequestHeaderExtraInfoSpec('firefox')).toEqual(['requestHeaders']);
  });
});
