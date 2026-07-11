export type ExternalProtocol = 'magnet' | 'ed2k' | 'thunder';
export type ExternalProtocolDisposition = 'handled' | 'browser';

export interface ExternalProtocolLink {
  protocol: ExternalProtocol;
  url: string;
}

export interface ExternalProtocolClickHandlerDeps {
  shouldIntercept: (link: ExternalProtocolLink) => boolean;
  sendProtocol: (link: ExternalProtocolLink) => Promise<ExternalProtocolDisposition>;
  openInBrowser: (url: string) => void;
}

const EXTERNAL_PROTOCOLS: readonly ExternalProtocol[] = ['magnet', 'ed2k', 'thunder'];

function getExternalProtocolLink(target: EventTarget | null): ExternalProtocolLink | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest('a[href]');
  const href = anchor?.getAttribute('href');
  if (!href) return null;

  const protocol = EXTERNAL_PROTOCOLS.find((candidate) => href.startsWith(`${candidate}:`));
  return protocol ? { protocol, url: href } : null;
}

export function createExternalProtocolClickHandler(deps: ExternalProtocolClickHandlerDeps) {
  return (event: MouseEvent): void => {
    const link = getExternalProtocolLink(event.target);
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

export function isExternalProtocol(value: string): value is ExternalProtocol {
  return (EXTERNAL_PROTOCOLS as readonly string[]).includes(value);
}

export function isCookieCollectableUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:' || protocol === 'ftp:';
  } catch {
    return false;
  }
}
