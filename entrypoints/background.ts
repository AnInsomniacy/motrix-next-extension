import { browser, type Browser } from 'wxt/browser';
import { DownloadOrchestrator, type DownloadCandidate } from '@/lib/download/orchestrator';
import { startChromiumTakeover } from '@/lib/download/chromium-takeover';
import { DuplicateDownloadGuard } from '@/lib/download/duplicate-guard';
import {
  RequestHeaderContextStore,
  buildRequestHeaderExtraInfoSpec,
  captureRequestHeaderContext,
  type RequestHeaderMatchResult,
} from '@/lib/download/request-context';
import { parseFirefoxDownloadResponse } from '@/lib/download/firefox-response';
import { DesktopApiClient } from '@/lib/api';
import { buildProtocolUrl, wakeAndWaitForApi } from '@/lib/desktop';
import {
  CONTEXT_MENU_CONTEXTS,
  CONTEXT_MENU_ID,
  buildDuplicateDownloadNotification,
  extractContextMenuUrl,
  hasCookieForwardingAccess,
  hasDownloadUiAccess,
  isExternalProtocol,
  webRequest,
  type ExternalProtocol,
} from '@/lib/browser';
import { loadSnapshot, saveDiagnosticLog } from '@/lib/storage';
import {
  DEFAULT_DOWNLOAD_SETTINGS,
  parseConnectionConfig,
  parseDownloadSettings,
  parseSiteRules,
  parseUiPrefs,
  type DiagnosticCode,
  type DownloadSettings,
  type SiteRule,
} from '@/lib/schema';
import { DiagnosticLog, type DiagnosticInput } from '@/lib/diagnostics';
import { I18nEngine } from '@/shared/i18n/engine';
import { FALLBACK_LOCALE, resolveLocaleId } from '@/shared/i18n/dictionaries';

export default defineBackground(() => {
  // ─── State (restored from storage on each SW wake) ────
  let settings: DownloadSettings = structuredClone(DEFAULT_DOWNLOAD_SETTINGS);
  let siteRules: SiteRule[] = [];
  let configLoaded = false;

  const bgI18n = new I18nEngine(FALLBACK_LOCALE);
  const diagnosticLog = new DiagnosticLog();
  const requestHeaderContexts = new RequestHeaderContextStore();
  const duplicateDownloadGuard = new DuplicateDownloadGuard();
  const desktopClient = new DesktopApiClient(parseConnectionConfig(null));

  // ─── Logging ──────────────────────────────────────────

  async function persistDiagnosticLog(): Promise<void> {
    try {
      await saveDiagnosticLog(diagnosticLog.getAll());
    } catch (e) {
      // Console only — log() here would recurse.
      console.warn('[MotrixNext] Diagnostic log persist failed:', e);
    }
  }

  function log(
    level: DiagnosticInput['level'],
    code: DiagnosticCode,
    message: string,
    context?: DiagnosticInput['context'],
  ): void {
    diagnosticLog.append({ level, code, message, context });
    void persistDiagnosticLog();
  }

  const logInfo = log.bind(null, 'info');
  const logWarn = log.bind(null, 'warn');
  const logError = log.bind(null, 'error');

  function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  // ─── Config Loading ───────────────────────────────────
  // One read per Service Worker lifecycle; storage.onChanged keeps the
  // in-memory config in sync afterwards.

  let configLoadPromise: Promise<void> | null = null;

  function ensureConfigLoaded(): Promise<void> {
    configLoadPromise ??= (async () => {
      try {
        const data = await loadSnapshot();
        settings = data.settings;
        siteRules = data.siteRules;
        diagnosticLog.hydrate(data.diagnosticLog);
        desktopClient.updateConfig(data.connection);
        bgI18n.setLocale(effectiveLocale(data.uiPrefs.locale));
        logInfo('config_loaded', 'Configuration loaded from storage', {
          port: data.connection.port,
          enabled: data.settings.enabled,
          ruleCount: data.siteRules.length,
        });
      } catch (e) {
        logError(
          'config_load_failed',
          `Configuration load failed, using defaults: ${errorMessage(e)}`,
        );
      } finally {
        configLoaded = true;
      }
    })();
    return configLoadPromise;
  }

  function effectiveLocale(locale: string): string {
    return locale === 'auto' ? resolveLocaleId(browser.i18n.getUILanguage()) : locale;
  }

  // ─── Download Bar ─────────────────────────────────────

  async function applyDownloadBarPreference(): Promise<void> {
    // Firefox does not support browser.downloads.setUiOptions.
    if (import.meta.env.FIREFOX) return;
    if (!settings.hideDownloadBar) {
      const canRestore = await hasDownloadUiAccess().catch(() => false);
      if (!canRestore) return;
    }
    await browser.downloads.setUiOptions({ enabled: !settings.hideDownloadBar });
  }

  function applyDownloadBarPreferenceSafely(): void {
    applyDownloadBarPreference().catch((e) => {
      logWarn('download_bar_error', `Download bar update failed: ${errorMessage(e)}`);
    });
  }

  // ─── Protocol Tab Lifecycle ───────────────────────────

  /**
   * Open a motrixnext:// URL in a focused tab (so the browser's protocol
   * confirmation dialog is visible) and clean the tab up once the handoff
   * completes — Chrome navigates it to about:blank after "Open".
   */
  async function openProtocolTab(url: string): Promise<() => void> {
    const tab = await browser.tabs.create({ url, active: true });
    const tabId = tab.id;
    if (!tabId) return () => {};

    const close = () => {
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.remove(tabId).catch(() => {});
    };
    const onUpdated = (id: number, info: { url?: string }) => {
      if (id === tabId && info.url === 'about:blank') close();
    };
    browser.tabs.onUpdated.addListener(onUpdated);
    // Safety net: clean up after 30s regardless.
    setTimeout(close, 30_000);
    return close;
  }

  // ─── Orchestrator ─────────────────────────────────────

  const orchestrator = new DownloadOrchestrator({
    downloads: {
      cancel: (id) => browser.downloads.cancel(id),
      erase: (query) => browser.downloads.erase(query).then(() => {}),
      download: (options) => browser.downloads.download(options),
    },
    cookies: {
      getAll: async (details) => {
        const granted = await hasCookieForwardingAccess().catch((e) => {
          logWarn('permission_revoked', `Cookie permission check failed: ${errorMessage(e)}`);
          return false;
        });
        return granted ? browser.cookies.getAll(details) : [];
      },
    },
    diagnosticLog: {
      append: (event) => {
        diagnosticLog.append(event);
        void persistDiagnosticLog();
      },
    },
    getSettings: () => settings,
    getSiteRules: () => siteRules,
    duplicateGuard: duplicateDownloadGuard,
    desktopClient,
    wakeDesktop: (timeoutMs) =>
      wakeAndWaitForApi({
        checkApi: () => desktopClient.isReachable(),
        openProtocol: () => openProtocolTab(buildProtocolUrl('new')),
        maxWaitMs: timeoutMs,
      }),
    openProtocolNewTask: async (url, referer, filename) => {
      await openProtocolTab(buildProtocolUrl('new', { url, referer, filename }));
    },
    onDuplicateBlocked: () => {
      const payload = buildDuplicateDownloadNotification(
        bgI18n.t('notification_duplicate_guard_title', 'Task submitted'),
        bgI18n.t('notification_duplicate_guard_body', 'Duplicate request skipped'),
      );
      try {
        browser.notifications.create(payload.id, payload.options);
      } catch (e) {
        logWarn('notification_create_failed', `Notification create failed: ${errorMessage(e)}`);
      }
    },
  });

  // ─── webRequest Listeners ─────────────────────────────

  const ALL_HTTP_URLS = ['http://*/*', 'https://*/*'];
  const HEADER_MATCH_DISABLED: RequestHeaderMatchResult = {
    matched: false,
    reason: 'not-found',
    context: undefined,
    source: undefined,
    ageMs: undefined,
  };

  function matchRequestHeaders(
    item: { url: string; finalUrl?: string },
    consume: boolean,
  ): RequestHeaderMatchResult {
    if (!settings.forwardRequestHeaders) return HEADER_MATCH_DISABLED;
    return consume ? requestHeaderContexts.match(item) : requestHeaderContexts.peek(item);
  }

  function headerDiagnostics(match: RequestHeaderMatchResult) {
    return {
      enabled: settings.forwardRequestHeaders,
      matched: match.matched,
      reason: settings.forwardRequestHeaders ? match.reason : ('disabled' as const),
      ...(match.source ? { source: match.source } : {}),
    };
  }

  /** Capture outgoing request headers for later forwarding to the desktop app. */
  function registerRequestHeaderContextListener(): void {
    const listener = webRequest?.onBeforeSendHeaders;
    const browserName = import.meta.env.FIREFOX ? 'firefox' : 'chromium';
    if (!listener) {
      logWarn('request_headers_listener_failed', 'Request header context listener unavailable', {
        browser: browserName,
        reason: 'missing-webRequest-listener',
      });
      return;
    }

    const capture = (details: {
      url: string;
      requestHeaders?: { name?: string; value?: string }[];
    }) => {
      if (!settings.forwardRequestHeaders) return;
      const context = captureRequestHeaderContext(details);
      if (context) requestHeaderContexts.remember(context);
    };

    // Chromium needs 'extraHeaders' for Cookie visibility; some builds
    // reject it, so retry once with the degraded spec.
    const fullSpec = buildRequestHeaderExtraInfoSpec(browserName);
    for (const extraInfoSpec of [fullSpec, ['requestHeaders']]) {
      try {
        listener.addListener(capture, { urls: ALL_HTTP_URLS }, extraInfoSpec);
        const degraded = extraInfoSpec !== fullSpec;
        log(
          degraded ? 'warn' : 'info',
          degraded ? 'request_headers_listener_downgraded' : 'request_headers_listener_ready',
          `Request header context listener ${degraded ? 'downgraded' : 'registered'}`,
          { browser: browserName, extraHeaders: extraInfoSpec.includes('extraHeaders') },
        );
        return;
      } catch (e) {
        if (extraInfoSpec === fullSpec && !fullSpec.includes('extraHeaders')) {
          // Degraded spec would be identical — report and stop.
          logWarn(
            'request_headers_listener_failed',
            `Request header context listener unavailable: ${errorMessage(e)}`,
            { browser: browserName },
          );
          return;
        }
        if (extraInfoSpec !== fullSpec) {
          logWarn(
            'request_headers_listener_failed',
            `Request header context listener unavailable: ${errorMessage(e)}`,
            { browser: browserName },
          );
        }
      }
    }
  }

  async function handleFirefoxResponseTakeover(candidate: DownloadCandidate): Promise<void> {
    await ensureConfigLoaded();
    const match = matchRequestHeaders(candidate, true);
    await orchestrator.handleFirefoxResponseTakeover({
      ...candidate,
      requestHeaderContext: match.context,
      requestHeaderDiagnostics: headerDiagnostics(match),
    });
  }

  /** Firefox: synchronously cancel binary responses before the native picker. */
  function registerFirefoxResponseInterception(): void {
    if (!import.meta.env.FIREFOX) return;
    try {
      webRequest?.onHeadersReceived?.addListener(
        (details): void | { cancel: true } => {
          const parsed = parseFirefoxDownloadResponse(details);
          if (!parsed) return;
          if (configLoaded && !orchestrator.shouldClaimFirefoxResponse(parsed)) return;

          void handleFirefoxResponseTakeover(parsed).catch((error) => {
            logError(
              'download_handler_error',
              `Firefox response takeover crashed: ${errorMessage(error)}`,
              { url: parsed.url, mime: parsed.mime, filename: parsed.filename },
            );
          });
          return { cancel: true };
        },
        { urls: ALL_HTTP_URLS, types: ['main_frame', 'sub_frame'] },
        ['blocking', 'responseHeaders'],
      );
    } catch (e) {
      logWarn('download_fallback', `Firefox response interception unavailable: ${errorMessage(e)}`);
    }
  }

  registerRequestHeaderContextListener();
  registerFirefoxResponseInterception();

  // ─── Download Interception ────────────────────────────

  function createBrowserDownloadItem(
    item: Browser.downloads.DownloadItem,
    consumeHeaders: boolean,
    filenameSource?: 'browser-determined',
  ) {
    const identity = { url: item.url, finalUrl: item.finalUrl || item.url };
    const match = matchRequestHeaders(identity, consumeHeaders);
    return {
      id: item.id,
      url: item.url,
      finalUrl: identity.finalUrl,
      filename: item.filename || '',
      ...(filenameSource ? { filenameSource } : {}),
      fileSize: item.fileSize ?? -1,
      totalBytes: item.totalBytes ?? item.fileSize ?? -1,
      mime: item.mime || '',
      byExtensionId: item.byExtensionId,
      state: item.state || 'in_progress',
      referrer: item.referrer || '',
      requestHeaderContext: match.context,
      requestHeaderDiagnostics: headerDiagnostics(match),
    };
  }

  async function handleFirefoxCreatedDownload(item: Browser.downloads.DownloadItem): Promise<void> {
    await ensureConfigLoaded();
    await orchestrator.handleFirefoxCreatedDownload(createBrowserDownloadItem(item, true));
  }

  async function handleChromiumTakeover(
    item: Browser.downloads.DownloadItem,
    cancellation: Promise<void>,
  ): Promise<void> {
    await ensureConfigLoaded();
    await orchestrator.handleChromiumTakeover(
      createBrowserDownloadItem(item, true, 'browser-determined'),
      cancellation,
    );
  }

  function isPotentialChromiumDownload(item: Browser.downloads.DownloadItem): boolean {
    if (item.state !== 'in_progress' || item.byExtensionId) return false;
    try {
      return ['http:', 'https:', 'ftp:'].includes(new URL(item.url).protocol);
    } catch {
      return false;
    }
  }

  function logDownloadHandlerError(item: Browser.downloads.DownloadItem, error: unknown): void {
    logError('download_handler_error', `Download handler crashed: ${errorMessage(error)}`, {
      url: item.url,
      mime: item.mime || '',
      filename: item.filename || '',
    });
  }

  if (import.meta.env.FIREFOX) {
    browser.downloads.onCreated.addListener((item) => {
      void handleFirefoxCreatedDownload(item).catch((error) => {
        logDownloadHandlerError(item, error);
      });
    });
  } else {
    browser.downloads.onDeterminingFilename.addListener((item) => {
      if (!isPotentialChromiumDownload(item)) return;
      if (
        configLoaded &&
        !orchestrator.shouldClaimChromiumDownload(
          createBrowserDownloadItem(item, false, 'browser-determined'),
        )
      ) {
        return;
      }

      startChromiumTakeover(
        () => browser.downloads.cancel(item.id),
        (cancellation) => handleChromiumTakeover(item, cancellation),
        (error) => logDownloadHandlerError(item, error),
      );
    });
  }

  // ─── Context Menu ─────────────────────────────────────

  function contextMenuTitle(): string {
    return bgI18n.t('context_menu_download', 'Download with Motrix Next');
  }

  function registerContextMenu(): void {
    browser.contextMenus.create(
      {
        id: CONTEXT_MENU_ID,
        title: contextMenuTitle(),
        contexts: CONTEXT_MENU_CONTEXTS as unknown as [Browser.contextMenus.ContextType],
      },
      // Ignore "duplicate id" error on re-registration.
      () => void browser.runtime.lastError,
    );
  }

  browser.contextMenus.onClicked.addListener((info) => {
    const rawUrl = extractContextMenuUrl(info);
    if (!rawUrl) return;

    logInfo('context_menu_triggered', `Context menu download: ${rawUrl}`, {
      url: rawUrl,
      pageUrl: info.pageUrl ?? '',
    });

    void ensureConfigLoaded().then(async () => {
      try {
        await orchestrator.sendUrl(rawUrl, info.pageUrl ?? '');
      } catch (e) {
        logError('download_failed', `Context menu download failed: ${errorMessage(e)}`, {
          url: rawUrl,
        });
      }
    });
  });

  // ─── External Protocol Links (from content script) ────

  interface ExternalProtocolMessage {
    type: 'HANDLE_EXTERNAL_PROTOCOL';
    url: string;
    protocol: ExternalProtocol;
  }

  function parseExternalProtocolMessage(msg: unknown): ExternalProtocolMessage | null {
    if (msg == null || typeof msg !== 'object') return null;
    const raw = msg as Record<string, unknown>;
    if (raw.type !== 'HANDLE_EXTERNAL_PROTOCOL') return null;
    if (typeof raw.url !== 'string') return null;
    if (typeof raw.protocol !== 'string' || !isExternalProtocol(raw.protocol)) return null;
    return { type: 'HANDLE_EXTERNAL_PROTOCOL', url: raw.url, protocol: raw.protocol };
  }

  async function handleExternalProtocol(
    msg: ExternalProtocolMessage,
  ): Promise<{ disposition: 'handled' | 'browser' }> {
    await ensureConfigLoaded();
    if (!settings.enabled || !settings.interceptionScope[msg.protocol]) {
      return { disposition: 'browser' };
    }

    const browserMode = settings.desktopUnavailable.action === 'browser';
    if (browserMode && !(await desktopClient.isReachable())) {
      logInfo('download_skipped', `Continued protocol in browser: ${msg.url}`, {
        url: msg.url,
        protocol: msg.protocol,
        stage: 'desktop-unavailable',
      });
      return { disposition: 'browser' };
    }

    logInfo('protocol_intercepted', `External protocol intercepted: ${msg.url}`, {
      url: msg.url,
      protocol: msg.protocol,
    });

    try {
      await orchestrator.sendUrl(
        msg.url,
        '',
        browserMode ? { allowWake: false, allowProtocol: false } : undefined,
      );
      return { disposition: 'handled' };
    } catch (e) {
      logError('download_failed', `Protocol download failed: ${errorMessage(e)}`, {
        url: msg.url,
        protocol: msg.protocol,
      });
      return { disposition: browserMode ? 'browser' : 'handled' };
    }
  }

  browser.runtime.onMessage.addListener((msg) => {
    const protocolMessage = parseExternalProtocolMessage(msg);
    return protocolMessage ? handleExternalProtocol(protocolMessage) : undefined;
  });

  // ─── Storage Sync ─────────────────────────────────────

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (changes.connection?.newValue) {
      desktopClient.updateConfig(parseConnectionConfig(changes.connection.newValue));
    }
    if (changes.settings?.newValue) {
      settings = parseDownloadSettings(changes.settings.newValue);
      applyDownloadBarPreferenceSafely();
    }
    if (changes.siteRules?.newValue) {
      siteRules = parseSiteRules(changes.siteRules.newValue);
    }
    if (changes.uiPrefs?.newValue) {
      bgI18n.setLocale(effectiveLocale(parseUiPrefs(changes.uiPrefs.newValue).locale));
      browser.contextMenus.update(CONTEXT_MENU_ID, { title: contextMenuTitle() });
    }

    const meaningful = Object.keys(changes).filter((k) => k !== 'diagnosticLog');
    if (meaningful.length > 0) {
      logInfo('config_changed', `Configuration updated: ${meaningful.join(', ')}`, {
        keys: meaningful.join(', '),
      });
    }
  });

  // ─── Lifecycle ────────────────────────────────────────

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

  logInfo(
    'extension_started',
    `Service worker started (v${browser.runtime.getManifest().version})`,
  );

  void ensureConfigLoaded().then(() => {
    // Register the context menu after the locale is loaded (i18n timing).
    registerContextMenu();
    applyDownloadBarPreferenceSafely();
  });
});
