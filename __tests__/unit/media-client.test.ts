import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing';
import { ApiAuthError, DesktopApiClient } from '@/lib/api';
import { submissionContext } from '@/lib/media/request-context';
import { parseDownloadSettings } from '@/lib/schema';
import { mediaCandidate, mediaPresentation } from '../fixtures/media';

beforeEach(() => {
  fakeBrowser.reset();
});
afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(browser.cookies, 'getPartitionKey');
});

describe('media HTTP boundary', () => {
  it('keeps desktop authentication separate from source credentials and validates the response', async () => {
    const client = new DesktopApiClient({ port: 29110, secret: 'desktop-secret' });
    const id = crypto.randomUUID();
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id,
          expiresAt: Date.now() + 300_000,
          state: 'ready',
          presentation: mediaPresentation(),
        }),
      ),
    );
    await client.createMediaProbe({
      id,
      source: {
        url: 'https://example.com/master.m3u8',
        kind: 'hls',
        pageUrl: 'https://example.com/watch',
        title: 'Video',
        filename: 'master.m3u8',
        mime: 'application/vnd.apple.mpegurl',
        requestContexts: [
          {
            url: 'https://example.com/master.m3u8',
            capturedAt: Date.now(),
            headers: [{ name: 'authorization', value: 'Bearer source-secret' }],
          },
        ],
      },
    });
    const request = fetch.mock.calls[0]?.[0];
    if (!(request instanceof Request)) throw new Error('Expected a native Request');
    expect(request.headers.get('authorization')).toBe('Bearer desktop-secret');
    expect(request.headers.get('cookie')).toBeNull();
    expect(await request.clone().json()).toMatchObject({
      source: {
        requestContexts: [{ headers: [{ name: 'authorization', value: 'Bearer source-secret' }] }],
      },
    });
  });
  it('distinguishes missing media integration, authentication failure, and invalid contracts', async () => {
    const client = new DesktopApiClient({ port: 29110, secret: 'secret' });
    const fetch = vi.spyOn(globalThis, 'fetch');
    fetch.mockResolvedValueOnce(new Response('Not found', { status: 404 }));
    await expect(client.mediaCapabilities()).rejects.toMatchObject({
      code: 'integration_unavailable',
    });
    fetch.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    await expect(client.mediaCapabilities()).rejects.toBeInstanceOf(ApiAuthError);
    fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ protocolVersion: 2, sourceKinds: ['hls'] })),
    );
    await expect(client.mediaCapabilities()).rejects.toMatchObject({ code: 'invalid_response' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

describe('source cookie context', () => {
  it('uses captured cookies without querying a different browser context', async () => {
    const getStores = vi.spyOn(browser.cookies, 'getAllCookieStores');
    const candidate = mediaCandidate({
      context: {
        url: 'https://cdn.example.com/master.m3u8?token=secret',
        capturedAt: Date.now(),
        headers: [{ name: 'cookie', value: 'captured=source-tab' }],
      },
    });
    const context = await submissionContext(candidate, parseDownloadSettings(null));
    expect(context.headers).toContainEqual({ name: 'cookie', value: 'captured=source-tab' });
    expect(getStores).not.toHaveBeenCalled();
  });
  it('uses the source tab store and both ordinary and partitioned cookies for a fallback', async () => {
    vi.spyOn(browser.cookies, 'getAllCookieStores').mockImplementation(async () => [
      { id: 'other', tabIds: [99] },
      { id: 'source', tabIds: [1] },
    ]);
    const partition = { topLevelSite: 'https://example.com' };
    // fakeBrowser predates the native Chromium CHIPS helper.
    Object.defineProperty(browser.cookies, 'getPartitionKey', {
      configurable: true,
      value: vi.fn(async () => ({ partitionKey: partition })),
    });
    const get = vi.spyOn(browser.cookies, 'getAll').mockImplementation(async (details) => [
      {
        name: details.partitionKey ? 'partitioned' : 'ordinary',
        value: 'source-value',
        domain: 'cdn.example.com',
        path: '/',
        hostOnly: true,
        httpOnly: true,
        secure: true,
        session: true,
        sameSite: 'lax',
        storeId: 'source',
        ...(details.partitionKey ? { partitionKey: partition } : {}),
      },
    ]);
    const candidate = mediaCandidate();
    const context = await submissionContext(candidate, parseDownloadSettings(null));
    expect(
      get.mock.calls.every(
        ([details]) => details.storeId === 'source' && details.url === candidate.url,
      ),
    ).toBe(true);
    expect(
      get.mock.calls.some(
        ([details]) => details.partitionKey?.topLevelSite === partition.topLevelSite,
      ),
    ).toBe(true);
    const cookie = context.headers.find((header) => header.name === 'cookie')?.value;
    expect(cookie).toContain('ordinary=source-value');
    expect(cookie).toContain('partitioned=source-value');
  });
});
