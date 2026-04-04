/**
 * @fileoverview Content script for magnet link interception.
 *
 * `magnet:` is a protocol link, not an HTTP download — `chrome.downloads`
 * and `chrome.webRequest` cannot intercept it. This content script captures
 * clicks on `<a href="magnet:...">` elements at the DOM level and routes
 * them to the background service worker via `chrome.runtime.sendMessage`.
 *
 * The background handles the magnet URI through `aria2.addUri`, which
 * natively supports magnet links.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    // Use capturing phase to intercept before any page-level handlers
    document.addEventListener(
      'click',
      (event: MouseEvent) => {
        const anchor = (event.target as Element)?.closest?.('a[href^="magnet:"]');
        if (!anchor) return;

        const href = anchor.getAttribute('href');
        if (!href) return;

        event.preventDefault();
        event.stopPropagation();

        chrome.runtime.sendMessage({ type: 'HANDLE_MAGNET', url: href });
      },
      true, // capture phase
    );
  },
});
