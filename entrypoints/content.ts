import { browser } from 'wxt/browser';
import {
  createExternalProtocolClickHandler,
  type ExternalProtocolDisposition,
} from '@/lib/browser';
import { parseDownloadSettings, type DownloadSettings } from '@/lib/schema';
import { observePageMedia } from '@/lib/media/page-observer';
import { createPlayerOverlay } from '@/lib/media/player-overlay';
import { z } from 'zod';

/**
 * One frame-local lifecycle for protocol clicks and passive media discovery.
 *
 * Protocol links (magnet/ed2k/thunder) are not HTTP downloads —
 * `browser.downloads` and `browser.webRequest` cannot intercept them. Clicks
 * are captured at the DOM level and routed to the background worker.
 */
export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  allFrames: true,
  matchOriginAsFallback: true,
  runAt: 'document_start',

  main(ctx) {
    let settings: DownloadSettings = parseDownloadSettings(null);
    let observer: ReturnType<typeof observePageMedia> | undefined;
    let invalidated = false;
    let overlay: Awaited<ReturnType<typeof createPlayerOverlay>> | undefined;
    let overlayPending: Promise<void> | undefined;
    let labels: Record<string, string> = {};
    let pageUrl = window.location.href;
    async function updateLabels() {
      const result: unknown = await browser.runtime.sendMessage({ type: 'MEDIA_OVERLAY_LABELS' });
      const parsed = z
        .object({ download: z.string(), close: z.string(), options: z.string() })
        .safeParse(result);
      if (parsed.success) labels = parsed.data;
      overlay?.localize();
    }
    async function showPlayer(player: HTMLMediaElement) {
      if (!overlay && !overlayPending)
        overlayPending = (async () => {
          await updateLabels();
          const created = await createPlayerOverlay(
            ctx,
            (key) => labels[key.replace('media_', '')] ?? 'Rayburst',
          );
          if (invalidated || !settings.mediaDiscovery.enabled) created.stop();
          else overlay = created;
        })().finally(() => {
          overlayPending = undefined;
        });
      await overlayPending;
      await overlay?.show(player);
    }
    function configure(value: unknown) {
      settings = parseDownloadSettings(value);
      if (settings.mediaDiscovery.enabled && !observer && !invalidated)
        observer = observePageMedia(
          (message) => browser.runtime.sendMessage(message),
          (player) => {
            void showPlayer(player).catch(() => undefined);
          },
        );
      overlay?.stop();
      overlay = undefined;
      if (!settings.mediaDiscovery.enabled) {
        observer?.stop();
        observer = undefined;
      }
    }

    void browser.storage.local.get('settings').then((data) => {
      configure(data.settings);
    });

    const storageChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
      changes,
      area,
    ) => {
      if (area !== 'local') return;
      if (changes.settings) configure(changes.settings.newValue);
      if (changes.uiPrefs) void updateLabels().catch(() => undefined);
    };
    const rescan: Parameters<typeof browser.runtime.onMessage.addListener>[0] = (
      message: unknown,
    ) => {
      if (
        message &&
        typeof message === 'object' &&
        'type' in message &&
        message.type === 'MEDIA_RESCAN'
      ) {
        if (pageUrl !== window.location.href) {
          pageUrl = window.location.href;
          overlay?.stop();
          overlay = undefined;
        }
        observer?.rescan();
      }
      if (
        message &&
        typeof message === 'object' &&
        'type' in message &&
        message.type === 'MEDIA_LOCATE_PLAYER' &&
        'url' in message &&
        typeof message.url === 'string'
      )
        return Promise.resolve(observer?.locate(message.url) ?? false);
    };
    browser.storage.onChanged.addListener(storageChanged);
    browser.runtime.onMessage.addListener(rescan);

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
    ctx.addEventListener(document, 'click', handleProtocolClick, { capture: true });
    ctx.addEventListener(window, 'pageshow', () => observer?.rescan());
    ctx.onInvalidated(() => {
      invalidated = true;
      observer?.stop();
      overlay?.stop();
      browser.storage.onChanged.removeListener(storageChanged);
      browser.runtime.onMessage.removeListener(rescan);
    });
  },
});
