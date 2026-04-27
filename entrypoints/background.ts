import { DownloadOrchestrator } from '@/lib/download';
import { DesktopApiClient } from '@/lib/api';
import {
  DownloadBarService,
  ContextMenuService,
  NotificationService,
  WakeService,
} from '@/lib/services';
import {
  DiagnosticLog,
  StorageService,
  parseDownloadSettings,
  parseSiteRules,
} from '@/lib/storage';
import { buildProtocolUrl, ProtocolAction } from '@/lib/protocol';
import { decodeThunderLink } from '@/shared/thunder';
import { DEFAULT_DOWNLOAD_SETTINGS } from '@/shared/constants';
import type { DownloadSettings, SiteRule, DiagnosticCode } from '@/shared/types';
import type { DiagnosticInput } from '@/lib/storage/diagnostic-log';
import { I18nEngine } from '@/shared/i18n/engine';
import { resolveLocaleId, FALLBACK_LOCALE } from '@/shared/i18n/dictionaries';

export default defineBackground(() => {
  // ─── State (restored from storage on each wake) ───
  let settings: DownloadSettings = { ...DEFAULT_DOWNLOAD_SETTINGS };
  let siteRules: SiteRule[] = [];

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

  // ─── Logging helpers ──────────────────────────────────

  /**
   * Append a diagnostic event and persist to storage.
   * Central logging point — all background logging flows through here.
   */
  function log(input: DiagnosticInput): void {
    diagnosticLog.append(input);
    void persistDiagnosticLog();
  }

  /** Shorthand for common log patterns. */
  function logInfo(
    code: DiagnosticCode,
    message: string,
    context?: DiagnosticInput['context'],
  ): void {
    log({ level: 'info', code, message, context });
  }

  function logWarn(
    code: DiagnosticCode,
    message: string,
    context?: DiagnosticInput['context'],
  ): void {
    log({ level: 'warn', code, message, context });
  }

  function logError(
    code: DiagnosticCode,
    message: string,
    context?: DiagnosticInput['context'],
  ): void {
    log({ level: 'error', code, message, context });
  }

  // ─── Desktop API client ───────────────────────
  const desktopClient = new DesktopApiClient({ port: 16801, secret: '' });
  const wakeService = new WakeService();

  // ─── Load config from storage on startup ──────────
  async function loadConfig(): Promise<void> {
    try {
      const { storage: data, migration } = await storageService.load();
      settings = data.settings;
      siteRules = data.siteRules;
      diagnosticLog.hydrate(data.diagnosticLog);

      // Sync desktop HTTP API client config from stored API settings
      desktopClient.updateConfig({
        port: data.connection.port,
        secret: data.connection.secret,
      });

      // Hydrate i18n locale
      const effectiveLocale =
        data.uiPrefs.locale === 'auto'
          ? resolveLocaleId(chrome.i18n.getUILanguage())
          : data.uiPrefs.locale;
      bgI18n.setLocale(effectiveLocale);

      // Log migration result when a migration actually ran
      if (migration.migrated) {
        logInfo('storage_migrated', `Storage migrated: v${migration.from} → v${migration.to}`, {
          from: migration.from,
          to: migration.to,
        });
      }

      logInfo('config_loaded', 'Configuration loaded from storage', {
        port: data.connection.port,
        enabled: data.settings.enabled,
        ruleCount: data.siteRules.length,
        locale: effectiveLocale,
      });
    } catch (e) {
      logError(
        'config_load_failed',
        `Configuration load failed, using defaults: ${e instanceof Error ? e.message : String(e)}`,
      );
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
    } catch (e) {
      // Log to console only — cannot use log() here to avoid infinite recursion
      // (log() → persistDiagnosticLog() → error → log() → ...)
      console.warn('[MotrixNext] Diagnostic log persist failed:', e);
    }
  }

  // ─── Get tab URL for referer ──────────────────────
  async function getTabUrl(): Promise<string> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab?.url ?? '';
    } catch (e) {
      logWarn(
        'tab_query_failed',
        `Tab query failed, referer will be empty: ${e instanceof Error ? e.message : String(e)}`,
      );
      return '';
    }
  }

  // ─── Orchestrator ───────────────────────────────────
  const orchestrator = new DownloadOrchestrator({
    downloads: {
      cancel: (id) => chrome.downloads.cancel(id),
      erase: (query) => chrome.downloads.erase(query).then(() => {}),
    },
    cookies: {
      getAll: (details) => chrome.cookies.getAll(details),
    },
    diagnosticLog: {
      append: (event: DiagnosticInput) => {
        diagnosticLog.append(event);
        void persistDiagnosticLog();
      },
    },
    getSettings: () => settings,
    getSiteRules: () => siteRules,
    getTabUrl,
    desktopClient,
    wakeDesktop: async () =>
      wakeService.wakeAndWaitForApi({
        checkApi: () => desktopClient.isReachable(),
        openProtocol: async () => {
          const tab = await chrome.tabs.create({
            url: buildProtocolUrl(ProtocolAction.NewTask, {}),
            active: true,
          });
          const tabId = tab.id;
          return () => {
            if (tabId) chrome.tabs.remove(tabId).catch(() => {});
          };
        },
      }),
    openProtocolNewTask: async (url: string, referer: string, cookie: string) => {
      const params: Record<string, string> = { url, referer };
      if (cookie) params.cookie = cookie;
      const protocolUrl = buildProtocolUrl(ProtocolAction.NewTask, params);
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
    onRouteFailed: (info) => {
      // This is the ONLY notification the extension should emit — the desktop
      // app handles start/complete/error notifications.  The extension uniquely
      // knows when a download was intercepted but never delivered.
      const payload = NotificationService.buildFailedNotification(
        info.filename,
        'Could not reach Motrix Next',
      );
      try {
        chrome.notifications.create(payload.id, payload.options);
      } catch (e) {
        logWarn(
          'notification_create_failed',
          `Notification create failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      logError('download_route_failed', `All routing paths failed: ${info.filename}`, {
        url: info.url,
      });
    },
  });

  // ─── Download interception ─────────────────────────────
  //
  // Unified path: onCreated fires for ALL downloads on all browsers.
  // Pattern: detect → filter → cancel + erase → route to desktop.
  //
  // Why not onDeterminingFilename (Chrome-only)?
  // Chrome skips onDeterminingFilename for navigation-to-download conversions
  // when <a target="_blank"> has non-ASCII characters in href (issue #21).
  // onCreated is the industry-standard interception mechanism used by
  // NeatDownloadManager, Free Download Manager, and other MV3 extensions.
  // It fires reliably for every download regardless of how it was initiated.

  chrome.downloads.onCreated.addListener((item) => {
    void ensureConfigLoaded().then(async () => {
      try {
        await orchestrator.handleCreated({
          id: item.id,
          url: item.url,
          finalUrl: item.finalUrl ?? item.url,
          filename: item.filename ?? '',
          fileSize: item.fileSize ?? -1,
          mime: item.mime ?? '',
          byExtensionId: (item as unknown as Record<string, unknown>).byExtensionId as
            | string
            | undefined,
          state: item.state ?? 'in_progress',
        });
      } catch (e) {
        logError(
          'download_handler_error',
          `Download handler crashed: ${e instanceof Error ? e.message : String(e)}`,
          { url: item.url },
        );
      }
    });
  });

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

    logInfo('context_menu_triggered', `Context menu download: ${rawUrl}`, {
      url: rawUrl,
      pageUrl: info.pageUrl ?? '',
    });

    void loadConfig().then(async () => {
      try {
        const url = decodeThunderLink(rawUrl);
        const tabUrl = info.pageUrl ?? '';
        await orchestrator.sendUrl(url, tabUrl);
      } catch (e) {
        logError(
          'download_failed',
          `Context menu download failed: ${e instanceof Error ? e.message : String(e)}`,
          {
            url: rawUrl,
          },
        );
      }
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
      logInfo('magnet_intercepted', `Magnet link intercepted: ${msg.url as string}`, {
        url: msg.url as string,
      });

      void loadConfig().then(async () => {
        try {
          const url = decodeThunderLink(msg.url as string);
          await orchestrator.sendUrl(url, '');
        } catch (e) {
          logError(
            'download_failed',
            `Magnet download failed: ${e instanceof Error ? e.message : String(e)}`,
            {
              url: msg.url as string,
            },
          );
        }
      });
    }
  });

  // Storage change listener — update config with schema validation
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    const changedKeys = Object.keys(changes);

    if (changes.connection?.newValue) {
      const conn = changes.connection.newValue as { port?: number; secret?: string };
      desktopClient.updateConfig({
        port: conn.port ?? 16801,
        secret: conn.secret ?? '',
      });
    }
    if (changes.settings?.newValue) {
      settings = parseDownloadSettings(changes.settings.newValue);
      void downloadBarService.apply({ hideDownloadBar: settings.hideDownloadBar }).catch((e) => {
        logWarn(
          'download_bar_error',
          `Download bar update failed: ${e instanceof Error ? e.message : String(e)}`,
        );
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

    // Log config changes — exclude diagnosticLog writes (too noisy)
    const meaningful = changedKeys.filter((k) => k !== 'diagnosticLog');
    if (meaningful.length > 0) {
      logInfo('config_changed', `Configuration updated: ${meaningful.join(', ')}`, {
        keys: meaningful.join(', '),
      });
    }
  });

  // ─── Extension install / update ───────────────────────
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      logInfo('extension_installed', 'Extension installed');
    } else if (details.reason === 'update') {
      logInfo(
        'extension_updated',
        `Extension updated from ${details.previousVersion ?? 'unknown'}`,
        {
          previousVersion: details.previousVersion ?? 'unknown',
          currentVersion: chrome.runtime.getManifest().version,
        },
      );
    }
  });

  // ─── Permission changes ───────────────────────────────
  chrome.permissions.onAdded?.addListener((permissions) => {
    logInfo(
      'permission_granted',
      `Permissions granted: ${permissions.permissions?.join(', ') ?? 'origins'}`,
      {
        permissions: permissions.permissions?.join(', ') ?? '',
        origins: permissions.origins?.join(', ') ?? '',
      },
    );
  });

  chrome.permissions.onRemoved?.addListener((permissions) => {
    logWarn(
      'permission_revoked',
      `Permissions revoked: ${permissions.permissions?.join(', ') ?? 'origins'}`,
      {
        permissions: permissions.permissions?.join(', ') ?? '',
        origins: permissions.origins?.join(', ') ?? '',
      },
    );
  });

  // ─── Initial load + context menu registration ─────────
  logInfo('extension_started', `Service worker started (v${chrome.runtime.getManifest().version})`);

  void ensureConfigLoaded().then(() => {
    // Register context menu after locale is loaded — fixes i18n timing
    registerContextMenus();

    downloadBarService.apply({ hideDownloadBar: settings.hideDownloadBar }).catch((e) => {
      logWarn(
        'download_bar_error',
        `Download bar init failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    });
  });
});
