import { describe, expect, it, vi } from 'vitest';
import { createExternalProtocolClickHandler } from '@/lib/browser';

function appendProtocolLink(href: string): HTMLAnchorElement {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.textContent = 'Protocol';
  document.body.append(anchor);
  return anchor;
}

describe('createExternalProtocolClickHandler', () => {
  it('does not prevent navigation when interception is paused', () => {
    const sendProtocol = vi.fn().mockResolvedValue('handled');
    const handler = createExternalProtocolClickHandler({
      shouldIntercept: () => false,
      sendProtocol,
      openInBrowser: vi.fn(),
    });
    const anchor = appendProtocolLink('magnet:?xt=urn:btih:abc123');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });

    anchor.addEventListener('click', handler, true);
    const allowed = anchor.dispatchEvent(event);

    expect(allowed).toBe(true);
    expect(event.defaultPrevented).toBe(false);
    expect(sendProtocol).not.toHaveBeenCalled();
  });

  it.each([
    ['magnet', 'magnet:?xt=urn:btih:abc123'],
    ['ed2k', 'ed2k://|file|eMule0.50a-Installer.exe|3389035|HASH|/'],
    ['thunder', 'thunder://QUFodHRwOi8vZXhhbXBsZS5jb20vZmlsZS56aXBaWg=='],
  ])('prevents navigation and sends %s links when enabled', (protocol, href) => {
    const sendProtocol = vi.fn().mockResolvedValue('handled');
    const handler = createExternalProtocolClickHandler({
      shouldIntercept: (candidate) => candidate.protocol === protocol,
      sendProtocol,
      openInBrowser: vi.fn(),
    });
    const anchor = appendProtocolLink(href);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });

    anchor.addEventListener('click', handler, true);
    const allowed = anchor.dispatchEvent(event);

    expect(allowed).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(sendProtocol).toHaveBeenCalledWith({ protocol, url: href });
  });

  it('continues with native browser navigation when the background requests browser handling', async () => {
    const openInBrowser = vi.fn();
    const handler = createExternalProtocolClickHandler({
      shouldIntercept: () => true,
      sendProtocol: vi.fn().mockResolvedValue('browser'),
      openInBrowser,
    });
    const href = 'magnet:?xt=urn:btih:abc123';
    const anchor = appendProtocolLink(href);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });

    anchor.addEventListener('click', handler, true);
    anchor.dispatchEvent(event);

    await vi.waitFor(() => expect(openInBrowser).toHaveBeenCalledWith(href));
  });
});
