import { browser } from 'wxt/browser';
import {
  createExternalProtocolClickHandler,
  type ExternalProtocol,
  type ExternalProtocolDisposition,
} from '@/lib/services';
import { parseDownloadSettings } from '@/lib/storage';
import { DEFAULT_DOWNLOAD_SETTINGS } from '@/shared/constants';
import type { InterceptionScope } from '@/shared/types';

/**
 * @fileoverview Content script for external protocol link interception.
 *
 * Protocol links are not HTTP downloads — `browser.downloads` and
 * `browser.webRequest` cannot intercept them. This content script captures
 * clicks at the DOM level and routes supported links to the background service
 * worker via `browser.runtime.sendMessage`.
 *
 * The background handles the URI through the desktop API.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    let interceptionEnabled = DEFAULT_DOWNLOAD_SETTINGS.enabled;
    let interceptionScope: InterceptionScope = { ...DEFAULT_DOWNLOAD_SETTINGS.interceptionScope };

    function applyInterceptionSettings(value: unknown): void {
      const settings = parseDownloadSettings(value);
      interceptionEnabled = settings.enabled;
      interceptionScope = settings.interceptionScope;
    }

    async function refreshInterceptionState(): Promise<void> {
      const data = await browser.storage.local.get('settings');
      applyInterceptionSettings(data.settings);
    }

    void refreshInterceptionState();

    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.settings) return;
      applyInterceptionSettings(changes.settings.newValue);
    });

    const handleProtocolClick = createExternalProtocolClickHandler({
      shouldIntercept: (link) => interceptionEnabled && interceptionScope[link.protocol],
      sendProtocol: async ({
        protocol,
        url,
      }: {
        protocol: ExternalProtocol;
        url: string;
      }): Promise<ExternalProtocolDisposition> => {
        const response: unknown = await browser.runtime.sendMessage({
          type: 'HANDLE_EXTERNAL_PROTOCOL',
          protocol,
          url,
        });
        if (
          response !== null &&
          typeof response === 'object' &&
          'disposition' in response &&
          response.disposition === 'browser'
        ) {
          return 'browser';
        }
        return 'handled';
      },
      openInBrowser: (url) => window.location.assign(url),
    });

    // Use capturing phase to intercept before any page-level handlers
    document.addEventListener(
      'click',
      handleProtocolClick,
      true, // capture phase
    );
  },
});
