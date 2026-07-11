import { browser, type Browser } from 'wxt/browser';
import { storage as wxtStorage } from '#imports';
import { DownloadOrchestrator, parseFirefoxDownloadResponse } from '@/lib/download';
import { DuplicateDownloadGuard } from '@/lib/download/duplicate-guard';
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
import { DEFAULT_CONNECTION_CONFIG, DEFAULT_DOWNLOAD_SETTINGS } from '@/shared/constants';
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
  const duplicateDownloadGuard = new DuplicateDownloadGuard();

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
  const desktopClient = new DesktopApiClient({
    port: DEFAULT_CONNECTION_CONFIG.port,
    secret: DEFAULT_CONNECTION_CONFIG.secret,
  });
  const wakeService = new WakeService();

  // ─── Load config from storage on startup ──────────
  let configRevision = 0;

  async function loadConfig(): Promise<void> {
    try {
      let data: Awaited<ReturnType<StorageService['load']>>;
      let loadRevision: number;
      do {
        loadRevision = configRevision;
        data = await storageService.load();
      } while (loadRevision !== configRevision);

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
  let configLoadPromise: Promise<void> | null = null;
  async function ensureConfigLoaded(): Promise<void> {
    if (configLoaded) return;
    if (!configLoadPromise) {
      configLoadPromise = loadConfig()
        .then(() => {
          configLoaded = true;
        })
        .finally(() => {
          configLoadPromise = null;
        });
    }
    await configLoadPromise;
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

  // ─── Orchestrator ───────────────────────────────────
  const orchestrator = new DownloadOrchestrator({
    downloads: {
      cancel: (id) => browser.downloads.cancel(id),
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
    getLatestSettings: async () => {
      const latestSettings = await storageService.loadSettings();
      settings = latestSettings;
      return latestSettings;
    },
    getSiteRules: () => siteRules,
    filenameMetadata,
    duplicateGuard: duplicateDownloadGuard,
    desktopClient,
    wakeDesktop: async (timeoutMs) =>
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
        maxWaitMs: timeoutMs,
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
    onDuplicateBlocked: () => {
      const payload = NotificationService.buildDuplicateDownloadNotification(
        bgI18n.t('notification_duplicate_guard_title', 'Task submitted'),
        bgI18n.t('notification_duplicate_guard_body', 'Duplicate request skipped'),
      );
      try {
        browser.notifications.create(payload.id, payload.options);
      } catch (e) {
        logWarn(
          'notification_create_failed',
          `Notification create failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  });

  type WebRequestHeader = { name?: string; value?: string };
  type WebRequestHeadersDetails = {
    url: string;
    method: string;
    type: string;
    statusCode: number;
    originUrl?: string;
    documentUrl?: string;
    responseHeaders?: WebRequestHeader[];
  };
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
        callback: (
          details: WebRequestHeadersDetails,
        ) => void | { cancel?: boolean } | Promise<void | { cancel?: boolean }>,
        filter: { urls: string[]; types?: string[] },
        extraInfoSpec?: string[],
      ) => void;
    };
  };
  // WXT's cross-browser type omits Firefox's Promise-returning blocking listener contract.
  const webRequest = (browser as unknown as { webRequest?: WebRequestApi }).webRequest;

  function registerRequestHeaderContextListener(): void {
    const requestHeaderBrowser: RequestHeaderBrowser = import.meta.env.FIREFOX
      ? 'firefox'
      : 'chromium';

    const addListener = (extraInfoSpec: string[]): boolean => {
      const listener = webRequest?.onBeforeSendHeaders;
      if (!listener) return false;

      listener.addListener(
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
      return true;
    };

    const extraInfoSpec = buildRequestHeaderExtraInfoSpec(requestHeaderBrowser);
    try {
      if (!addListener(extraInfoSpec)) {
        logWarn('request_headers_listener_failed', 'Request header context listener unavailable', {
          browser: requestHeaderBrowser,
          stage: 'request-headers',
          reason: 'missing-webRequest-listener',
        });
        return;
      }
      logInfo('request_headers_listener_ready', 'Request header context listener registered', {
        browser: requestHeaderBrowser,
        stage: 'request-headers',
        extraHeaders: extraInfoSpec.includes('extraHeaders'),
      });
    } catch (e) {
      if (!import.meta.env.FIREFOX && extraInfoSpec.includes('extraHeaders')) {
        try {
          if (!addListener(['requestHeaders'])) {
            logWarn(
              'request_headers_listener_failed',
              'Request header context listener unavailable',
              {
                browser: requestHeaderBrowser,
                stage: 'request-headers',
                reason: 'missing-webRequest-listener',
              },
            );
            return;
          }
          logWarn(
            'request_headers_listener_downgraded',
            'Request header context listener downgraded',
            {
              browser: requestHeaderBrowser,
              stage: 'request-headers',
              extraHeaders: false,
            },
          );
          return;
        } catch (fallbackError) {
          logWarn(
            'request_headers_listener_failed',
            `Request header context listener unavailable: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
            {
              browser: requestHeaderBrowser,
              stage: 'request-headers',
              reason: 'fallback-registration-failed',
            },
          );
          return;
        }
      }

      logWarn(
        'request_headers_listener_failed',
        `Request header context listener unavailable: ${e instanceof Error ? e.message : String(e)}`,
        {
          browser: requestHeaderBrowser,
          stage: 'request-headers',
          reason: 'registration-failed',
        },
      );
    }
  }

  function registerFilenameMetadataListeners(): void {
    if (import.meta.env.FIREFOX) return;
    try {
      webRequest?.onHeadersReceived?.addListener(
        (details): undefined => {
          if (!settings.enabled || !settings.interceptionScope.browserDownloads) return undefined;
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

  function registerFirefoxResponseInterception(): void {
    if (!import.meta.env.FIREFOX) return;

    try {
      webRequest?.onHeadersReceived?.addListener(
        async (details): Promise<void | { cancel: true }> => {
          await ensureConfigLoaded();
          const parsed = parseFirefoxDownloadResponse(details);
          if (!parsed) return;

          const headerMatch = settings.forwardRequestHeaders
            ? requestHeaderContexts.peek({ url: parsed.item.url, finalUrl: parsed.item.finalUrl })
            : {
                matched: false,
                reason: 'disabled' as const,
                context: undefined,
                source: undefined,
                ageMs: undefined,
              };
          const intercepted = await orchestrator.handleResponse(
            {
              ...parsed.item,
              requestHeaderContext: headerMatch.context,
              requestHeaderDiagnostics: {
                enabled: settings.forwardRequestHeaders,
                matched: headerMatch.matched,
                reason: headerMatch.reason,
                ...(headerMatch.source ? { source: headerMatch.source } : {}),
                ...(headerMatch.ageMs !== undefined ? { ageMs: headerMatch.ageMs } : {}),
              },
            },
            parsed.metadata,
          );
          if (!intercepted) return;

          if (settings.forwardRequestHeaders && headerMatch.matched) {
            requestHeaderContexts.match({
              url: parsed.item.url,
              finalUrl: parsed.item.finalUrl,
            });
          }
          return { cancel: true };
        },
        {
          urls: ['http://*/*', 'https://*/*'],
          types: ['main_frame', 'sub_frame'],
        },
        ['blocking', 'responseHeaders'],
      );
    } catch (e) {
      logWarn(
        'download_fallback',
        `Firefox response interception unavailable: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  registerRequestHeaderContextListener();
  registerFilenameMetadataListeners();
  registerFirefoxResponseInterception();

  // ─── Download interception ─────────────────────────────
  //
  // Chromium uses onCreated. Firefox uses blocking response interception for
  // attachment responses and retains onCreated for unsupported response shapes.
  //
  // Why not onDeterminingFilename (Chrome-only)?
  // Registering that listener makes Chromium ignore filenames supplied by
  // other extensions through downloads.download({ filename }). onCreated keeps
  // interception reliable without breaking other download managers.

  browser.downloads.onCreated.addListener((item) => {
    void (async () => {
      try {
        await ensureConfigLoaded();
        const headerMatch = settings.forwardRequestHeaders
          ? requestHeaderContexts.match({
              url: item.url,
              finalUrl: item.finalUrl ?? item.url,
            })
          : {
              matched: false,
              reason: 'disabled' as const,
              context: undefined,
              source: undefined,
              ageMs: undefined,
            };
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
          requestHeaderContext: headerMatch.context,
          requestHeaderDiagnostics: {
            enabled: settings.forwardRequestHeaders,
            matched: headerMatch.matched,
            reason: headerMatch.reason,
            ...(headerMatch.source ? { source: headerMatch.source } : {}),
            ...(headerMatch.ageMs !== undefined ? { ageMs: headerMatch.ageMs } : {}),
          },
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
      }
    })();
  });

  // Context menu registration waits for the initial configuration load
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

    void ensureConfigLoaded().then(async () => {
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

  async function handleExternalProtocolMessage(
    protocolMessage: ExternalProtocolMessage,
  ): Promise<{ disposition: 'handled' | 'browser' }> {
    await ensureConfigLoaded();
    if (!settings.enabled || !settings.interceptionScope[protocolMessage.protocol]) {
      return { disposition: 'browser' };
    }

    const browserMode = settings.desktopUnavailable.action === 'browser';
    if (browserMode && !(await desktopClient.isReachable())) {
      logInfo('download_skipped', `Continued protocol in browser: ${protocolMessage.url}`, {
        url: protocolMessage.url,
        protocol: protocolMessage.protocol,
        stage: 'desktop-unavailable',
      });
      return { disposition: 'browser' };
    }

    logInfo('protocol_intercepted', `External protocol intercepted: ${protocolMessage.url}`, {
      url: protocolMessage.url,
      protocol: protocolMessage.protocol,
    });

    try {
      await orchestrator.sendUrl(
        protocolMessage.url,
        '',
        browserMode ? { allowWake: false, allowProtocol: false } : undefined,
      );
      return { disposition: 'handled' };
    } catch (e) {
      logError(
        'download_failed',
        `Protocol download failed: ${e instanceof Error ? e.message : String(e)}`,
        {
          url: protocolMessage.url,
          protocol: protocolMessage.protocol,
        },
      );
      return { disposition: browserMode ? 'browser' : 'handled' };
    }
  }

  // External protocol link interception from content script
  browser.runtime.onMessage.addListener((msg) => {
    const protocolMessage = parseExternalProtocolMessage(msg);
    return protocolMessage ? handleExternalProtocolMessage(protocolMessage) : undefined;
  });

  // Storage change listener — update config with schema validation
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    const changedKeys = Object.keys(changes);
    if (changes.connection || changes.settings || changes.siteRules || changes.uiPrefs) {
      configRevision += 1;
    }

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
