import { browser, type Browser } from 'wxt/browser';
import { storage as wxtStorage } from '#imports';
import { DownloadOrchestrator } from '@/lib/download';
import { DownloadFilenameGate, type SuggestedFilename } from '@/lib/download/filename-gate';
import { DownloadFilenameMetadataStore } from '@/lib/download/filename-metadata';
import {
  RequestHeaderContextStore,
  buildRequestHeaderExtraInfoSpec,
  captureRequestHeaderContext,
  type RequestHeaderBrowser,
} from '@/lib/download/request-context';
import { DesktopApiClient } from '@/lib/api';
import {
  DownloadBarService,
  ContextMenuService,
  NotificationService,
  WakeService,
  PermissionService,
  isExternalProtocol,
} from '@/lib/services';
import {
  DiagnosticLog,
  StorageService,
  createWxtStorageApi,
  parseConnectionConfig,
  parseDownloadSettings,
  parseSiteRules,
  parseUiPrefs,
} from '@/lib/storage';
import { buildProtocolUrl, ProtocolAction } from '@/lib/protocol';
import { DEFAULT_DOWNLOAD_SETTINGS } from '@/shared/constants';
import type { DownloadSettings, SiteRule, DiagnosticCode, InterceptionScope } from '@/shared/types';
import type { DiagnosticInput } from '@/lib/storage/diagnostic-log';
import { I18nEngine } from '@/shared/i18n/engine';
import { resolveLocaleId, FALLBACK_LOCALE } from '@/shared/i18n/dictionaries';

export default defineBackground(() => {
  // ─── State (restored from storage on each wake) ───
  let settings: DownloadSettings = { ...DEFAULT_DOWNLOAD_SETTINGS };
  let siteRules: SiteRule[] = [];

  type ExternalProtocolMessage = {
    type: 'HANDLE_EXTERNAL_PROTOCOL';
    url: string;
    protocol: keyof InterceptionScope;
  };

  function parseExternalProtocolMessage(msg: unknown): ExternalProtocolMessage | null {
    if (msg == null || typeof msg !== 'object') return null;
    const raw = msg as Record<string, unknown>;
    if (raw.type !== 'HANDLE_EXTERNAL_PROTOCOL') return null;
    if (typeof raw.url !== 'string') return null;
    if (typeof raw.protocol !== 'string' || !isExternalProtocol(raw.protocol)) return null;
    return {
      type: 'HANDLE_EXTERNAL_PROTOCOL',
      url: raw.url,
      protocol: raw.protocol,
    };
  }

  const bgI18n = new I18nEngine(FALLBACK_LOCALE);
  // Firefox does not support browser.downloads.setUiOptions — create a no-op
  // service so call sites don't need null checks.
  const downloadBarService = import.meta.env.FIREFOX
    ? new DownloadBarService({ setUiOptions: () => Promise.resolve() })
    : new DownloadBarService({
        setUiOptions: (opts) => browser.downloads.setUiOptions(opts),
      });
  const diagnosticLog = new DiagnosticLog();
  const filenameMetadata = new DownloadFilenameMetadataStore();
  const requestHeaderContexts = new RequestHeaderContextStore();
  const filenameGate = new DownloadFilenameGate();

  const storageService = new StorageService(createWxtStorageApi(wxtStorage));
  const permissionService = new PermissionService({
    contains: (permissions) => browser.permissions.contains(permissions),
    request: (permissions) => browser.permissions.request(permissions),
  });

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
          ? resolveLocaleId(browser.i18n.getUILanguage())
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

  async function applyDownloadBarPreference(): Promise<void> {
    if (import.meta.env.FIREFOX) return;
    if (!settings.hideDownloadBar) {
      const canRestore = await permissionService.hasDownloadUiAccess().catch(() => false);
      if (!canRestore) return;
    }
    await downloadBarService.apply({ hideDownloadBar: settings.hideDownloadBar });
  }

  // ─── Get tab URL for referer ──────────────────────
  async function getTabUrl(): Promise<string> {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
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
      cancel: async (id) => {
        try {
          await browser.downloads.cancel(id);
        } finally {
          filenameGate.release(id);
        }
      },
      erase: (query) => browser.downloads.erase(query).then(() => {}),
    },
    cookies: {
      getAll: async (details) => {
        if (!settings.forwardCookies) return [];
        const granted = await permissionService.hasCookieForwardingAccess().catch((e) => {
          logWarn(
            'permission_revoked',
            `Cookie permission check failed: ${e instanceof Error ? e.message : String(e)}`,
          );
          return false;
        });
        return granted ? browser.cookies.getAll(details) : [];
      },
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
    filenameMetadata,
    desktopClient,
    wakeDesktop: async () =>
      wakeService.wakeAndWaitForApi({
        checkApi: () => desktopClient.isReachable(),
        openProtocol: async () => {
          const tab = await browser.tabs.create({
            url: buildProtocolUrl(ProtocolAction.NewTask, {}),
            active: true,
          });
          const tabId = tab.id;
          return () => {
            if (tabId) browser.tabs.remove(tabId).catch(() => {});
          };
        },
      }),
    openProtocolNewTask: async (url: string, referer: string, filename?: string) => {
      const params: Record<string, string> = { url, referer };
      if (filename) params.filename = filename;
      const protocolUrl = buildProtocolUrl(ProtocolAction.NewTask, params);
      // Create tab for the protocol URL — active:true so the "Open MotrixNext?"
      // confirmation dialog gets focus and is visible to the user.
      const tab = await browser.tabs.create({ url: protocolUrl, active: true });
      if (tab.id) {
        const tabId = tab.id;
        // Clean up the tab once the protocol handoff completes.
        // After the user clicks "Open", Chrome navigates to about:blank.
        const onUpdated = (id: number, info: { url?: string }) => {
          if (id === tabId && info.url === 'about:blank') {
            browser.tabs.onUpdated.removeListener(onUpdated);
            browser.tabs.remove(tabId).catch(() => {});
          }
        };
        browser.tabs.onUpdated.addListener(onUpdated);
        // Safety fallback: clean up after 30s regardless
        setTimeout(() => {
          browser.tabs.onUpdated.removeListener(onUpdated);
          browser.tabs.remove(tabId).catch(() => {});
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
        browser.notifications.create(payload.id, payload.options);
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

  type DeterminingFilenameItem = {
    id: number;
    url: string;
    finalUrl?: string;
    filename?: string;
  };
  type DownloadsWithDeterminingFilename = typeof browser.downloads & {
    onDeterminingFilename?: {
      addListener: (
        callback: (item: DeterminingFilenameItem, suggest: SuggestedFilename) => true | void,
      ) => void;
    };
  };
  type WebRequestHeader = { name?: string; value?: string };
  type WebRequestHeadersDetails = { url: string; responseHeaders?: WebRequestHeader[] };
  type WebRequestBeforeSendHeadersDetails = { url: string; requestHeaders?: WebRequestHeader[] };
  type WebRequestApi = {
    onBeforeSendHeaders?: {
      addListener: (
        callback: (details: WebRequestBeforeSendHeadersDetails) => void,
        filter: { urls: string[] },
        extraInfoSpec?: string[],
      ) => void;
    };
    onHeadersReceived?: {
      addListener: (
        callback: (details: WebRequestHeadersDetails) => void,
        filter: { urls: string[] },
        extraInfoSpec?: string[],
      ) => void;
    };
  };

  function registerRequestHeaderContextListener(): void {
    const browserWithWebRequest = browser as typeof browser & { webRequest?: WebRequestApi };
    const requestHeaderBrowser: RequestHeaderBrowser = import.meta.env.FIREFOX
      ? 'firefox'
      : 'chromium';

    const addListener = (extraInfoSpec: string[]) => {
      browserWithWebRequest.webRequest?.onBeforeSendHeaders?.addListener(
        (details): undefined => {
          if (!settings.forwardRequestHeaders) return undefined;
          const context = captureRequestHeaderContext({
            url: details.url,
            requestHeaders: details.requestHeaders,
          });
          if (context) {
            requestHeaderContexts.remember(context);
          }
          return undefined;
        },
        { urls: ['http://*/*', 'https://*/*'] },
        extraInfoSpec,
      );
    };

    const extraInfoSpec = buildRequestHeaderExtraInfoSpec(requestHeaderBrowser);
    try {
      addListener(extraInfoSpec);
    } catch (e) {
      if (!import.meta.env.FIREFOX && extraInfoSpec.includes('extraHeaders')) {
        try {
          addListener(['requestHeaders']);
          logWarn('download_fallback', 'Request header context listener downgraded', {
            stage: 'request-headers',
          });
          return;
        } catch (fallbackError) {
          logWarn(
            'download_fallback',
            `Request header context listener unavailable: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
          );
          return;
        }
      }

      logWarn(
        'download_fallback',
        `Request header context listener unavailable: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  function registerFilenameMetadataListeners(): void {
    const downloads = browser.downloads as DownloadsWithDeterminingFilename;
    downloads.onDeterminingFilename?.addListener((item, suggest) => {
      filenameMetadata.rememberDeterminedFilename(item);
      return filenameGate.hold(item.id, suggest);
    });

    const browserWithWebRequest = browser as typeof browser & { webRequest?: WebRequestApi };
    try {
      browserWithWebRequest.webRequest?.onHeadersReceived?.addListener(
        (details): undefined => {
          const contentDisposition = details.responseHeaders?.find(
            (header) => header.name?.toLowerCase() === 'content-disposition',
          )?.value;
          if (contentDisposition) {
            filenameMetadata.rememberContentDisposition(details.url, contentDisposition);
          }
          return undefined;
        },
        { urls: ['http://*/*', 'https://*/*'] },
        ['responseHeaders'],
      );
    } catch (e) {
      logWarn(
        'download_fallback',
        `Response header metadata listener unavailable: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  registerRequestHeaderContextListener();
  registerFilenameMetadataListeners();

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

  browser.downloads.onCreated.addListener((item) => {
    void (async () => {
      try {
        await ensureConfigLoaded();
        await orchestrator.handleCreated({
          id: item.id,
          url: item.url,
          finalUrl: item.finalUrl ?? item.url,
          filename: item.filename ?? '',
          fileSize: item.fileSize ?? -1,
          totalBytes: item.totalBytes ?? item.fileSize ?? -1,
          mime: item.mime ?? '',
          byExtensionId: (item as unknown as Record<string, unknown>).byExtensionId as
            | string
            | undefined,
          state: item.state ?? 'in_progress',
          referrer: item.referrer ?? '',
          requestHeaderContext: settings.forwardRequestHeaders
            ? requestHeaderContexts.match({
                url: item.url,
                finalUrl: item.finalUrl ?? item.url,
              })
            : undefined,
        });
      } catch (e) {
        logError(
          'download_handler_error',
          `Download handler crashed: ${e instanceof Error ? e.message : String(e)}`,
          {
            url: item.url,
            fileSize: item.fileSize ?? -1,
            totalBytes: item.totalBytes ?? item.fileSize ?? -1,
            mime: item.mime ?? '',
            filename: item.filename ?? '',
          },
        );
      } finally {
        filenameGate.release(item.id);
      }
    })();
  });

  // Context menu — registration deferred (see loadConfig().then() below)
  // so that bgI18n has the user's locale loaded before reading the title.
  function registerContextMenus(): void {
    const menuItems = ContextMenuService.buildMenuItems();
    for (const menuItem of menuItems) {
      browser.contextMenus.create(
        {
          id: menuItem.id,
          title: bgI18n.t('context_menu_download', menuItem.title),
          contexts: menuItem.contexts as [
            Browser.contextMenus.ContextType,
            ...Browser.contextMenus.ContextType[],
          ],
        },
        // Ignore "duplicate id" error on re-registration
        () => void browser.runtime.lastError,
      );
    }
  }

  /** Update existing context menu titles when locale changes. */
  function updateContextMenuLocale(): void {
    const menuItems = ContextMenuService.buildMenuItems();
    for (const menuItem of menuItems) {
      browser.contextMenus.update(menuItem.id, {
        title: bgI18n.t('context_menu_download', menuItem.title),
      });
    }
  }

  browser.contextMenus.onClicked.addListener((info) => {
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
        const tabUrl = info.pageUrl ?? '';
        await orchestrator.sendUrl(rawUrl, tabUrl);
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
  browser.notifications.onClicked.addListener((notificationId) => {
    const action = NotificationService.resolveClickAction(notificationId);
    switch (action) {
      case 'launch-app':
        void browser.tabs.create({ url: buildProtocolUrl(), active: false }).then((tab) => {
          if (tab.id) setTimeout(() => browser.tabs.remove(tab.id!), 500);
        });
        break;
      case 'open-options':
        void browser.runtime.openOptionsPage();
        break;
    }
  });

  // External protocol link interception from content script
  browser.runtime.onMessage.addListener((msg) => {
    const protocolMessage = parseExternalProtocolMessage(msg);
    if (protocolMessage) {
      void loadConfig().then(async () => {
        if (!settings.enabled) {
          logInfo(
            'download_skipped',
            `Skipped protocol while interception is paused: ${protocolMessage.url}`,
            {
              url: protocolMessage.url,
              stage: 'enabled',
            },
          );
          return;
        }
        if (!settings.interceptionScope[protocolMessage.protocol]) {
          logInfo('download_skipped', `Skipped protocol by scope: ${protocolMessage.url}`, {
            url: protocolMessage.url,
            protocol: protocolMessage.protocol,
            stage: 'interception-scope',
          });
          return;
        }

        logInfo('protocol_intercepted', `External protocol intercepted: ${protocolMessage.url}`, {
          url: protocolMessage.url,
          protocol: protocolMessage.protocol,
        });

        try {
          await orchestrator.sendUrl(protocolMessage.url, '');
        } catch (e) {
          logError(
            'download_failed',
            `Protocol download failed: ${e instanceof Error ? e.message : String(e)}`,
            {
              url: protocolMessage.url,
              protocol: protocolMessage.protocol,
            },
          );
        }
      });
    }
  });

  // Storage change listener — update config with schema validation
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    const changedKeys = Object.keys(changes);

    if (changes.connection?.newValue) {
      const conn = parseConnectionConfig(changes.connection.newValue);
      desktopClient.updateConfig({
        port: conn.port,
        secret: conn.secret,
      });
    }
    if (changes.settings?.newValue) {
      settings = parseDownloadSettings(changes.settings.newValue);
      void applyDownloadBarPreference().catch((e) => {
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
      const prefs = parseUiPrefs(changes.uiPrefs.newValue);
      const effectiveLocale =
        prefs.locale === 'auto' ? resolveLocaleId(browser.i18n.getUILanguage()) : prefs.locale;
      bgI18n.setLocale(effectiveLocale);
      updateContextMenuLocale();
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
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      logInfo('extension_installed', 'Extension installed');
    } else if (details.reason === 'update') {
      logInfo(
        'extension_updated',
        `Extension updated from ${details.previousVersion ?? 'unknown'}`,
        {
          previousVersion: details.previousVersion ?? 'unknown',
          currentVersion: browser.runtime.getManifest().version,
        },
      );
    }
  });

  // ─── Permission changes ───────────────────────────────
  browser.permissions.onAdded?.addListener((permissions) => {
    logInfo(
      'permission_granted',
      `Permissions granted: ${permissions.permissions?.join(', ') ?? 'origins'}`,
      {
        permissions: permissions.permissions?.join(', ') ?? '',
        origins: permissions.origins?.join(', ') ?? '',
      },
    );
  });

  browser.permissions.onRemoved?.addListener((permissions) => {
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
  logInfo(
    'extension_started',
    `Service worker started (v${browser.runtime.getManifest().version})`,
  );

  void ensureConfigLoaded().then(() => {
    // Register context menu after locale is loaded — fixes i18n timing
    registerContextMenus();

    applyDownloadBarPreference().catch((e) => {
      logWarn(
        'download_bar_error',
        `Download bar init failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    });
  });
});
