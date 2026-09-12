import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing';
import { z } from 'zod';
import { startMediaBackground } from '@/lib/media/background';
import { DesktopApiClient } from '@/lib/api';
import { RequestHeaderContextStore } from '@/lib/download/request-context';
import { MEDIA_SESSION_KEY, MediaSessionSchema, parseDownloadSettings } from '@/lib/schema';
import { MediaListSchema } from '@/lib/media/messages';

let response: Parameters<typeof browser.webRequest.onResponseStarted.addListener>[0];
let request: Parameters<typeof browser.webRequest.onSendHeaders.addListener>[0];
let tabId: number;
let documentId: string;
let frameUrl: string;

async function snapshot() {
  const saved = await browser.storage.session.get(MEDIA_SESSION_KEY);
  const result = MediaSessionSchema.safeParse(saved[MEDIA_SESSION_KEY]);
  return result.success ? result.data : { candidates: [], operations: [], contexts: [] };
}
function resource(
  url: string,
  patch: Partial<Parameters<typeof response>[0]> = {},
): Parameters<typeof response>[0] {
  return {
    url,
    requestId: 'request-one',
    method: 'GET',
    type: 'xmlhttprequest',
    tabId,
    frameId: 0,
    documentId,
    documentLifecycle: 'active',
    frameType: 'outermost_frame',
    parentFrameId: -1,
    timeStamp: Date.now(),
    statusCode: 200,
    statusLine: 'HTTP/1.1 200 OK',
    fromCache: false,
    ip: '127.0.0.1',
    responseHeaders: [{ name: 'Content-Type', value: 'application/vnd.apple.mpegurl' }],
    ...patch,
  };
}

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  const tab = await fakeBrowser.tabs.create({ url: 'https://example.com/watch', active: true });
  if (tab.id === undefined) throw new Error('Missing test tab');
  tabId = tab.id;
  documentId = 'current-document';
  frameUrl = 'https://example.com/watch';
  vi.spyOn(browser.webRequest.onSendHeaders, 'addListener').mockImplementation((listener) => {
    request = listener;
  });
  vi.spyOn(browser.webRequest.onResponseStarted, 'addListener').mockImplementation((listener) => {
    response = listener;
  });
  vi.spyOn(browser.webRequest.onCompleted, 'addListener').mockImplementation(() => undefined);
  vi.spyOn(browser.webRequest.onErrorOccurred, 'addListener').mockImplementation(() => undefined);
  vi.spyOn(browser.tabs.onReplaced, 'addListener').mockImplementation(() => undefined);
  vi.spyOn(browser.action, 'setBadgeText').mockResolvedValue(undefined);
  vi.spyOn(browser.action, 'setBadgeBackgroundColor').mockResolvedValue(undefined);
  vi.spyOn(browser.webNavigation, 'getFrame').mockImplementation(async () => ({
    url: frameUrl,
    documentId,
    errorOccurred: false,
    parentFrameId: -1,
    documentLifecycle: 'active',
    frameType: 'outermost_frame',
    processId: 1,
  }));
  vi.spyOn(browser.webNavigation, 'getAllFrames').mockImplementation(async () => [
    {
      url: frameUrl,
      documentId,
      frameId: 0,
      errorOccurred: false,
      parentFrameId: -1,
      documentLifecycle: 'active',
      frameType: 'outermost_frame',
      processId: 1,
    },
  ]);
  const settings = parseDownloadSettings(null);
  startMediaBackground({
    client: new DesktopApiClient({ port: 29110, secret: '' }),
    ensureConfig: async () => undefined,
    settings: () => settings,
    siteRules: () => [],
    connection: () => ({ port: 29110, secret: '' }),
    activate: async () => false,
    requestHeaders: new RequestHeaderContextStore(),
  });
  // Flush startup cleanup before feeding native event fixtures.
  await vi.waitFor(async () => expect(browser.action.setBadgeText).toHaveBeenCalled());
});
afterEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
});

describe('browser discovery integration', () => {
  it("binds floating UI to its native parent frame and rejects another frame's candidate", async () => {
    response(resource('https://cdn.example.com/main.m3u8'));
    await vi.waitFor(async () => expect((await snapshot()).candidates).toHaveLength(1));
    const candidate = (await snapshot()).candidates[0]!;
    const tab = await browser.tabs.get(tabId);
    const normalFrame = await browser.webNavigation.getFrame({ tabId, frameId: 0 });
    vi.spyOn(browser.webNavigation, 'getFrame').mockImplementation(async ({ frameId }) => {
      if (!normalFrame) return null;
      return { ...normalFrame, parentFrameId: frameId === 10 ? 2 : -1 };
    });
    const sender = {
      id: browser.runtime.id,
      url: browser.runtime.getURL('/media.html'),
      tab,
      frameId: 10,
    };
    const listed: unknown[] = await fakeBrowser.runtime.onMessage.trigger(
      { type: 'MEDIA_FRAME', command: { type: 'MEDIA_LIST', tabId: 99999 } },
      sender,
    );
    const view = z
      .object({ ok: z.literal(true), data: MediaListSchema })
      .parse(listed.find((value) => value !== undefined));
    expect(view.data.items).toEqual([]);
    const rejected: unknown[] = await fakeBrowser.runtime.onMessage.trigger(
      {
        type: 'MEDIA_FRAME',
        command: { type: 'MEDIA_PROBE', tabId: 99999, candidateId: candidate.id },
      },
      sender,
    );
    expect(rejected).toContainEqual({ ok: false, error: 'source_expired' });
    expect((await snapshot()).operations).toEqual([]);
  });
  it("returns only sources from the content sender's native frame", async () => {
    response(resource('https://cdn.example.com/main.m3u8'));
    await vi.waitFor(async () => expect((await snapshot()).candidates).toHaveLength(1));
    const results: unknown[] = await fakeBrowser.runtime.onMessage.trigger(
      { type: 'MEDIA_FRAME', command: { type: 'MEDIA_LIST', tabId: 99999 } },
      {
        id: browser.runtime.id,
        url: frameUrl,
        documentId,
        tab: await browser.tabs.get(tabId),
        frameId: 0,
      },
    );
    const view = z
      .object({ ok: z.literal(true), data: MediaListSchema })
      .parse(results.find((value) => value !== undefined));
    expect(view.data.items).toHaveLength(1);
    expect(view.data.items[0]?.tabId).toBe(tabId);
    expect(JSON.stringify(view)).not.toContain('headers');
  });
  it('rejects a pre-navigation response even when a browser provides no document ID', async () => {
    const stale = resource('https://cdn.example.com/stale.m3u8', { documentId: undefined });
    request({ ...stale, requestHeaders: [{ name: 'Cookie', value: 'previous-session' }] });
    await fakeBrowser.webNavigation.onCommitted.trigger({
      tabId,
      frameId: 0,
      url: frameUrl,
      timeStamp: Date.now(),
      processId: 1,
      transitionType: 'reload',
      transitionQualifiers: [],
    });
    response(stale);
    const fresh = resource('https://cdn.example.com/fresh.m3u8', {
      requestId: 'fresh-request',
      documentId: undefined,
    });
    request({ ...fresh, requestHeaders: [] });
    response(fresh);
    await vi.waitFor(async () => expect((await snapshot()).candidates).toHaveLength(1));
    expect((await snapshot()).candidates[0]?.url).toContain('fresh.m3u8');
  });
  it('pairs headers by request ID and never exposes them in the popup snapshot', async () => {
    const details = resource('https://cdn.example.com/master.m3u8?signature=secret');
    request({
      ...details,
      requestHeaders: [
        { name: 'Cookie', value: 'session=private' },
        { name: 'Authorization', value: 'Bearer private' },
      ],
    });
    response(details);
    await vi.waitFor(async () => expect((await snapshot()).candidates).toHaveLength(1));
    expect(
      (await snapshot()).candidates[0]?.context?.headers.some(
        (header) => header.name === 'authorization',
      ),
    ).toBe(true);
    const results: unknown[] = await fakeBrowser.runtime.onMessage.trigger(
      { type: 'MEDIA_LIST', tabId },
      { id: browser.runtime.id, url: browser.runtime.getURL('/popup.html') },
    );
    const result = results.find((value) => value !== undefined);
    const parsed = z.object({ ok: z.literal(true), data: MediaListSchema }).parse(result).data;
    expect(parsed.items[0]?.hasRequestContext).toBe(true);
    expect(JSON.stringify(parsed)).not.toContain('session=private');
    expect(JSON.stringify(parsed)).not.toContain('Bearer private');
  });
  it('drops responses from an old document and never assigns worker requests to the active tab', async () => {
    response(resource('https://cdn.example.com/old.m3u8', { documentId: 'previous-document' }));
    response(resource('https://cdn.example.com/worker.m3u8', { tabId: -1 }));
    response(resource('https://cdn.example.com/current.m3u8'));
    await vi.waitFor(async () => expect((await snapshot()).candidates).toHaveLength(1));
    expect((await snapshot()).candidates[0]?.url).toContain('current.m3u8');
  });
  it('does not add fragments as titles and preserves their own origin context', async () => {
    const details = resource('https://segments.example.com/part-1.m4s', {
      responseHeaders: [{ name: 'Content-Type', value: 'video/iso.segment' }],
    });
    request({ ...details, requestHeaders: [{ name: 'Cookie', value: 'segment-session=private' }] });
    response(details);
    await vi.waitFor(async () => expect((await snapshot()).contexts).toHaveLength(1));
    expect((await snapshot()).candidates).toEqual([]);
    expect((await snapshot()).contexts[0]?.url).toBe(details.url);
  });
  it('ignores privileged commands from content scripts', async () => {
    const results: unknown[] = await fakeBrowser.runtime.onMessage.trigger(
      { type: 'MEDIA_ENABLE', tabId, enabled: false },
      {
        id: browser.runtime.id,
        url: frameUrl,
        tab: await fakeBrowser.tabs.get(tabId),
        frameId: 0,
      },
    );
    expect(results.every((result) => result === undefined)).toBe(true);
    expect((await browser.storage.local.get('settings')).settings).toBeUndefined();
  });
  it('removes sources when the tab closes', async () => {
    response(resource('https://cdn.example.com/master.m3u8'));
    await vi.waitFor(async () => expect((await snapshot()).candidates).toHaveLength(1));
    await fakeBrowser.tabs.onRemoved.trigger(tabId, { windowId: 1, isWindowClosing: false });
    await vi.waitFor(async () => expect((await snapshot()).candidates).toEqual([]));
  });
});
