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
});
