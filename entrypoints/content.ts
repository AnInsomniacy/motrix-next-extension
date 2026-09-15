import { browser } from 'wxt/browser';
import {
  createExternalProtocolClickHandler,
  type ExternalProtocolDisposition,
} from '@/lib/browser';
import { parseDownloadSettings, type DownloadSettings } from '@/lib/schema';

/**
 * Content script for external protocol link interception.
 *
 * Protocol links (magnet/ed2k/thunder) are not HTTP downloads —
 * `browser.downloads` and `browser.webRequest` cannot intercept them. Clicks
 * are captured at the DOM level and routed to the background worker.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    let settings: DownloadSettings = parseDownloadSettings(null);

    void browser.storage.local.get('settings').then((data) => {
      settings = parseDownloadSettings(data.settings);
    });

    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.settings) return;
      settings = parseDownloadSettings(changes.settings.newValue);
    });

    const handleProtocolClick = createExternalProtocolClickHandler({
      shouldIntercept: (link) => settings.enabled && settings.interceptionScope[link.protocol],
      sendProtocol: async ({ protocol, url }): Promise<ExternalProtocolDisposition> => {
        const response: unknown = await browser.runtime.sendMessage({
          type: 'HANDLE_EXTERNAL_PROTOCOL',
          protocol,
          url,
        });
        return response !== null &&
          typeof response === 'object' &&
          'disposition' in response &&
          response.disposition === 'browser'
          ? 'browser'
          : 'handled';
      },
      openInBrowser: (url) => window.location.assign(url),
    });

    // Capture phase — intercept before any page-level handlers.
    document.addEventListener('click', handleProtocolClick, true);
  },
});
