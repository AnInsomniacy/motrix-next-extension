/**
 * Thin, typed helpers over `browser.*` APIs: optional permissions, context
 * menu definitions, notifications, external protocol links, and the
 * webRequest listener types WXT's cross-browser typings omit.
 */
import { browser, type Browser } from 'wxt/browser';
import type { InterceptionScope } from './schema';

// ─── Optional Permissions ───────────────────────────────

const COOKIE_FORWARDING_PERMISSION: Browser.permissions.Permissions = {
  permissions: ['cookies'],
  origins: ['https://*/*', 'http://*/*'],
};

const DOWNLOAD_UI_PERMISSION: Browser.permissions.Permissions = {
  permissions: ['downloads.ui'],
};

export const hasCookieForwardingAccess = (): Promise<boolean> =>
  browser.permissions.contains(COOKIE_FORWARDING_PERMISSION);

export const requestCookieForwardingAccess = (): Promise<boolean> =>
  browser.permissions.request(COOKIE_FORWARDING_PERMISSION);

export const hasDownloadUiAccess = (): Promise<boolean> =>
  browser.permissions.contains(DOWNLOAD_UI_PERMISSION);

export const requestDownloadUiAccess = (): Promise<boolean> =>
  browser.permissions.request(DOWNLOAD_UI_PERMISSION);

// ─── Context Menu ───────────────────────────────────────

export const CONTEXT_MENU_ID = 'download-with-motrix-next';
export const CONTEXT_MENU_CONTEXTS = ['link', 'image', 'audio', 'video'] as const;

/**
 * Extract the downloadable URL from context menu click info.
 * Prefers the link target, falls back to the media source.
 */
export function extractContextMenuUrl(info: { linkUrl?: string; srcUrl?: string }): string | null {
  return info.linkUrl ?? info.srcUrl ?? null;
}

// ─── Notifications ──────────────────────────────────────

export function buildDuplicateDownloadNotification(title: string, message: string) {
  return {
    id: `duplicate-download-${Date.now()}`,
    options: { type: 'basic', title, message, iconUrl: 'icon/128.png' } as const,
  };
}

// ─── External Protocol Links (magnet / ed2k / thunder) ──

export type ExternalProtocol = Exclude<keyof InterceptionScope, 'browserDownloads'>;
export type ExternalProtocolDisposition = 'handled' | 'browser';

export interface ExternalProtocolLink {
  protocol: ExternalProtocol;
  url: string;
}

const EXTERNAL_PROTOCOLS: readonly ExternalProtocol[] = ['magnet', 'ed2k', 'thunder'];

export function isExternalProtocol(value: string): value is ExternalProtocol {
  return (EXTERNAL_PROTOCOLS as readonly string[]).includes(value);
}

function findExternalProtocolLink(target: EventTarget | null): ExternalProtocolLink | null {
  if (!(target instanceof Element)) return null;
  const href = target.closest('a[href]')?.getAttribute('href');
  if (!href) return null;
  const protocol = EXTERNAL_PROTOCOLS.find((candidate) => href.startsWith(`${candidate}:`));
  return protocol ? { protocol, url: href } : null;
}

export interface ExternalProtocolClickHandlerDeps {
  shouldIntercept: (link: ExternalProtocolLink) => boolean;
  sendProtocol: (link: ExternalProtocolLink) => Promise<ExternalProtocolDisposition>;
  openInBrowser: (url: string) => void;
}

/** DOM click handler that routes protocol links to the background worker. */
export function createExternalProtocolClickHandler(deps: ExternalProtocolClickHandlerDeps) {
  return (event: MouseEvent): void => {
    const link = findExternalProtocolLink(event.target);
    if (!link || !deps.shouldIntercept(link)) return;

    event.preventDefault();
    event.stopPropagation();
    void deps
      .sendProtocol(link)
      .then((disposition) => {
        if (disposition === 'browser') deps.openInBrowser(link.url);
      })
      .catch(() => {});
  };
}

// ─── webRequest Types ───────────────────────────────────
// WXT's cross-browser typings omit Firefox's blocking listener contract.

export type WebRequestHeader = { name?: string; value?: string };

export interface WebRequestHeadersDetails {
  url: string;
  method: string;
  type: string;
  statusCode: number;
  originUrl?: string;
  documentUrl?: string;
  responseHeaders?: WebRequestHeader[];
}

export interface WebRequestApi {
  onBeforeSendHeaders?: {
    addListener: (
      callback: (details: { url: string; requestHeaders?: WebRequestHeader[] }) => void,
      filter: { urls: string[] },
      extraInfoSpec?: string[],
    ) => void;
  };
  onHeadersReceived?: {
    addListener: (
      callback: (details: WebRequestHeadersDetails) => void | { cancel?: boolean },
      filter: { urls: string[]; types?: string[] },
      extraInfoSpec?: string[],
    ) => void;
  };
}

export const webRequest = (browser as unknown as { webRequest?: WebRequestApi }).webRequest;
