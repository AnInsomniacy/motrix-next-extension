import { browser } from 'wxt/browser';
import type { DownloadSettings, MediaCandidate } from '../schema';
import type { MediaRequestContext } from './contracts';

const TRANSPORT_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'range',
  'accept-encoding',
  'keep-alive',
  'te',
  'trailer',
  'upgrade',
]);

/** Native Headers validates names and values. Transport and conditional headers belong to libcurl. */
export function captureMediaContext(
  url: string,
  raw: { name?: string; value?: string }[],
  settings: Pick<DownloadSettings, 'forwardCookies' | 'forwardRequestHeaders'>,
): MediaRequestContext {
  const headers = new Headers();
  let bytes = 0;
  for (const header of raw) {
    const name = header.name?.toLowerCase().trim();
    const value = header.value;
    if (
      !name ||
      name.length > 128 ||
      value == null ||
      TRANSPORT_HEADERS.has(name) ||
      name.startsWith('proxy-') ||
      name.startsWith('if-')
    )
      continue;
    if (name === 'cookie' ? !settings.forwardCookies : !settings.forwardRequestHeaders) continue;
    if (
      value.length > 8192 ||
      Array.from(value).some((character) => {
        const code = character.charCodeAt(0);
        return (code < 32 && code !== 9) || code === 127;
      }) ||
      headers.has(name)
    )
      continue;
    if (bytes + name.length + value.length > 16_384 || [...headers].length >= 32) break;
    try {
      headers.set(name, value);
    } catch {
      continue;
    }
    bytes += name.length + value.length;
  }
  return {
    url,
    capturedAt: Date.now(),
    headers: [...headers].map(([name, value]) => ({ name, value })),
  };
}

/** Resolve cookies in the source tab's store and partition, never the popup's cookie context. */
export async function submissionContext(
  candidate: MediaCandidate,
  settings: DownloadSettings,
): Promise<MediaRequestContext> {
  const captured = captureMediaContext(candidate.url, candidate.context?.headers ?? [], settings);
  if (settings.forwardCookies && !captured.headers.some((header) => header.name === 'cookie')) {
    const stores = await browser.cookies.getAllCookieStores();
    const store = stores.find((item) => item.tabIds.includes(candidate.tabId));
    if (!store) return captured;
    // Firefox exposes its container's cookie store directly. Chromium also needs CHIPS partition identity.
    const partition = import.meta.env.FIREFOX
      ? undefined
      : (
          await browser.cookies.getPartitionKey({
            tabId: candidate.tabId,
            frameId: candidate.frameId,
          })
        ).partitionKey;
    const [ordinary, partitioned] = await Promise.all([
      browser.cookies.getAll({ url: candidate.url, storeId: store.id }),
      partition
        ? browser.cookies.getAll({ url: candidate.url, storeId: store.id, partitionKey: partition })
        : Promise.resolve([]),
    ]);
    const cookies = [...ordinary, ...partitioned].sort((a, b) => b.path.length - a.path.length);
    if (cookies.length) {
      const value = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
      return captureMediaContext(
        candidate.url,
        [...captured.headers, { name: 'cookie', value }],
        settings,
      );
    }
  }
  return captured;
}
