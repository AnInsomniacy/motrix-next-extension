import { DownloadOrchestrator } from '@/lib/download';
import { DownloadBarService, ContextMenuService, NotificationService } from '@/lib/services';
import {
  DiagnosticLog,
  StorageService,
  parseRpcConfig,
  parseDownloadSettings,
  parseSiteRules,
} from '@/lib/storage';
import { buildProtocolUrl, ProtocolAction } from '@/lib/protocol';
import { decodeThunderLink } from '@/shared/thunder';
import { DEFAULT_RPC_CONFIG, DEFAULT_DOWNLOAD_SETTINGS } from '@/shared/constants';
import type { DownloadSettings, RpcConfig, SiteRule } from '@/shared/types';
import { I18nEngine } from '@/shared/i18n/engine';
import { resolveLocaleId, FALLBACK_LOCALE } from '@/shared/i18n/dictionaries';

export default defineBackground(() => {
  // ─── State (restored from storage on each wake) ───
  let rpcConfig: RpcConfig = { ...DEFAULT_RPC_CONFIG };
  let settings: DownloadSettings = { ...DEFAULT_DOWNLOAD_SETTINGS };
  let siteRules: SiteRule[] = [];
  let enhancedPermissions = false;

  const bgI18n = new I18nEngine(FALLBACK_LOCALE);
  // Firefox does not support chrome.downloads.setUiOptions — create a no-op
  // service so call sites don't need null checks.
  const downloadBarService = import.meta.env.FIREFOX
    ? new DownloadBarService({ setUiOptions: () => Promise.resolve() })
    : new DownloadBarService({
        setUiOptions: (opts) => chrome.downloads.setUiOptions(opts),
      });
  const diagnosticLog = new DiagnosticLog();

  const storageService = new StorageService(chrome.storage.local);

  // ─── Load config from storage on startup ──────────
  async function loadConfig(): Promise<void> {
    try {
      const data = await storageService.load();
      rpcConfig = data.rpc;
      settings = data.settings;
      siteRules = data.siteRules;
      diagnosticLog.hydrate(data.diagnosticLog);

      // Hydrate i18n locale
      const effectiveLocale =
        data.uiPrefs.locale === 'auto'
          ? resolveLocaleId(chrome.i18n.getUILanguage())
          : data.uiPrefs.locale;
      bgI18n.setLocale(effectiveLocale);
    } catch {
      // Use defaults on first install
    }

    // Check enhanced permissions — downloads.ui is Chromium-only
    try {
      enhancedPermissions = await chrome.permissions.contains({
        permissions: import.meta.env.FIREFOX ? ['cookies'] : ['cookies', 'downloads.ui'],
        origins: ['https://*/*', 'http://*/*'],
      });
    } catch {
      enhancedPermissions = false;
    }
  }

  // One-time config loading per Service Worker lifecycle.
  // storage.onChanged keeps config in sync after the initial load,
  // so we only need to read from storage once per cold start.
  let configLoaded = false;
  async function ensureConfigLoaded(): Promise<void> {
    if (configLoaded) return;
    await loadConfig();
    configLoaded = true;
  }

  // ─── Persist diagnostic log to storage ────────────
  async function persistDiagnosticLog(): Promise<void> {
    try {
      await storageService.saveDiagnosticLog(diagnosticLog.getAll());
    } catch {
      // Silently fail — not critical
    }
  }

  // ─── Get tab URL for referer ──────────────────────
  async function getTabUrl(): Promise<string> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab?.url ?? '';
    } catch {
      return '';
    }
  }

  // ─── Orchestrator ─────────────────────────────────
  const orchestrator = new DownloadOrchestrator({
    downloads: {
      cancel: (id) => chrome.downloads.cancel(id),
      erase: (query) => chrome.downloads.erase(query).then(() => {}),
    },
    diagnosticLog: {
      append: (event) => {
        diagnosticLog.append(event);
        void persistDiagnosticLog();
      },
    },
    getSettings: () => settings,
    getSiteRules: () => siteRules,
    getTabUrl,
    hasEnhancedPermissions: () => enhancedPermissions,
    openProtocolNewTask: async (url: string, referer: string) => {
      const protocolUrl = buildProtocolUrl(ProtocolAction.NewTask, { url, referer });
      // Create tab for the protocol URL — active:true so the "Open MotrixNext?"
      // confirmation dialog gets focus and is visible to the user.
      const tab = await chrome.tabs.create({ url: protocolUrl, active: true });
      if (tab.id) {
        const tabId = tab.id;
        // Clean up the tab once the protocol handoff completes.
        // After the user clicks "Open", Chrome navigates to about:blank.
        const onUpdated = (id: number, info: { url?: string }) => {
          if (id === tabId && info.url === 'about:blank') {
            chrome.tabs.onUpdated.removeListener(onUpdated);
            chrome.tabs.remove(tabId).catch(() => {});
          }
        };
        chrome.tabs.onUpdated.addListener(onUpdated);
        // Safety fallback: clean up after 30s regardless
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          chrome.tabs.remove(tabId).catch(() => {});
        }, 30000);
      }
    },
  });

  // ─── Download interception ─────────────────────────────
  //
  // Chrome: onDeterminingFilename — blocking event where Chrome holds the
  // download in pending state until suggest() is called. Eliminates race.
  //
  // Firefox: onCreated — non-blocking notification that a download started.
  // We cancel + erase it immediately, then re-download via aria2.
  // This is the standard pattern used by all Firefox download managers.

  if (import.meta.env.FIREFOX) {
    // Firefox path: onCreated fires after the download has been initiated.
    // Cancel immediately, collect metadata, and send to aria2.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (browser.downloads as any).onCreated.addListener((item: Record<string, unknown>) => {
      void ensureConfigLoaded().then(async () => {
        try {
          await orchestrator.handleCreated({
            id: item.id as number,
            url: (item.url as string) ?? '',
            finalUrl: (item.finalUrl as string) ?? (item.url as string) ?? '',
            filename: (item.filename as string) ?? '',
            fileSize: (item.fileSize as number) ?? -1,
            mime: (item.mime as string) ?? '',
            byExtensionId: item.byExtensionId as string | undefined,
            state: (item.state as string) ?? 'in_progress',
          });
        } catch {
          // Error → browser continues the download naturally
        }
      });
    });
  } else {
    // Chrome path: onDeterminingFilename is a blocking event.
    // Chrome holds the download in pending state until suggest() is called.
    chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
      void ensureConfigLoaded().then(async () => {
        try {
          const intercepted = await orchestrator.handleCreated({
            id: item.id,
            url: item.url,
            finalUrl: item.finalUrl,
            filename: item.filename,
            fileSize: item.fileSize,
            mime: item.mime,
            byExtensionId: (item as unknown as Record<string, string>).byExtensionId,
            state: item.state,
          });
          if (!intercepted) suggest();
        } catch {
          suggest(); // Error → let browser handle it
        }
      });
      return true; // Will call suggest() asynchronously
    });
  }

  // Context menu — registration deferred (see loadConfig().then() below)
  // so that bgI18n has the user's locale loaded before reading the title.
  function registerContextMenus(): void {
    const menuItems = ContextMenuService.buildMenuItems();
    for (const menuItem of menuItems) {
      chrome.contextMenus.create(
        {
          id: menuItem.id,
          title: bgI18n.t('context_menu_download', menuItem.title),
          contexts: menuItem.contexts as [
            chrome.contextMenus.ContextType,
            ...chrome.contextMenus.ContextType[],
          ],
        },
        // Ignore "duplicate id" error on re-registration
        () => void chrome.runtime.lastError,
      );
    }
  }

  /** Update existing context menu titles when locale changes. */
  function updateContextMenuLocale(): void {
    const menuItems = ContextMenuService.buildMenuItems();
    for (const menuItem of menuItems) {
      chrome.contextMenus.update(menuItem.id, {
        title: bgI18n.t('context_menu_download', menuItem.title),
      });
    }
  }

  chrome.contextMenus.onClicked.addListener((info) => {
    const rawUrl = ContextMenuService.extractUrl({
      linkUrl: info.linkUrl,
      srcUrl: info.srcUrl,
      pageUrl: info.pageUrl,
    });
    if (!rawUrl) return;

    void loadConfig().then(async () => {
      const url = decodeThunderLink(rawUrl);
      const tabUrl = info.pageUrl ?? '';
      await orchestrator.sendUrl(url, tabUrl);
    });
  });

  // Notification clicks
  chrome.notifications.onClicked.addListener((notificationId) => {
    const action = NotificationService.resolveClickAction(notificationId);
    switch (action) {
      case 'launch-app':
        void chrome.tabs.create({ url: buildProtocolUrl(), active: false }).then((tab) => {
          if (tab.id) setTimeout(() => chrome.tabs.remove(tab.id!), 500);
        });
        break;
      case 'open-options':
        void chrome.runtime.openOptionsPage();
        break;
    }
  });

  // Magnet link interception from content script
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'HANDLE_MAGNET' && typeof msg.url === 'string') {
      void loadConfig().then(async () => {
        const url = decodeThunderLink(msg.url as string);
        await orchestrator.sendUrl(url, '');
      });
    }
  });

  // Storage change listener — update config with schema validation
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.rpc?.newValue) {
      rpcConfig = parseRpcConfig(changes.rpc.newValue);
    }
    if (changes.settings?.newValue) {
      settings = parseDownloadSettings(changes.settings.newValue);
      void downloadBarService.apply({
        hideDownloadBar: settings.hideDownloadBar,
        hasEnhancedPermissions: enhancedPermissions,
      });
    }
    if (changes.siteRules?.newValue) {
      siteRules = parseSiteRules(changes.siteRules.newValue);
    }
    if (changes.uiPrefs?.newValue) {
      const prefs = changes.uiPrefs.newValue as { locale?: string };
      if (prefs.locale) {
        const effectiveLocale =
          prefs.locale === 'auto' ? resolveLocaleId(chrome.i18n.getUILanguage()) : prefs.locale;
        bgI18n.setLocale(effectiveLocale);
        updateContextMenuLocale();
      }
    }
  });

  // Initial load + context menu registration + download bar + polling
  void ensureConfigLoaded().then(() => {
    // Register context menu after locale is loaded — fixes i18n timing
    registerContextMenus();

    downloadBarService.apply({
      hideDownloadBar: settings.hideDownloadBar,
      hasEnhancedPermissions: enhancedPermissions,
    });
  });
});
