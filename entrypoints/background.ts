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
import { ApiAuthError, DesktopApiClient } from '@/lib/api';
import {
  DesktopActivationError,
  activateDesktop,
  createDesktopActivationCoordinator,
} from '@/lib/desktop';
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
import { loadDiagnosticEvents, loadSnapshot, saveDiagnosticEvents } from '@/lib/storage';
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
import { createDiagnosticJournal, type DiagnosticInput } from '@/lib/diagnostics';
import { I18nEngine } from '@/shared/i18n/engine';
import { FALLBACK_LOCALE, resolveLocaleId } from '@/shared/i18n/dictionaries';

export default defineBackground(() => {
  // ─── State (restored from storage on each SW wake) ────
  let settings: DownloadSettings = structuredClone(DEFAULT_DOWNLOAD_SETTINGS);
  let siteRules: SiteRule[] = [];
  let configLoaded = false;

  const bgI18n = new I18nEngine(FALLBACK_LOCALE);
  const diagnosticLog = createDiagnosticJournal({
    load: loadDiagnosticEvents,
    save: saveDiagnosticEvents,
    onPersistError: (error) => {
      console.warn('[MotrixNext] Diagnostic persistence failed:', error);
    },
  });
  const requestHeaderContexts = new RequestHeaderContextStore();
  const duplicateDownloadGuard = new DuplicateDownloadGuard();
  const desktopClient = new DesktopApiClient(parseConnectionConfig(null));
  const activateDesktopAndWait = createDesktopActivationCoordinator();

  // ─── Logging ──────────────────────────────────────────

  function log(
    level: DiagnosticInput['level'],
    code: DiagnosticCode,
    message: string,
    context?: DiagnosticInput['context'],
  ): void {
    diagnosticLog.append({ level, code, message, context });
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
        desktopClient.updateConfig(data.connection);
        bgI18n.setLocale(effectiveLocale(data.uiPrefs.locale));
      } catch (e) {
        logError('config_load_failed', 'Configuration could not be loaded; defaults are active', {
          error: errorMessage(e),
        });
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
      logWarn('download_bar_failed', 'Download bar preference could not be applied', {
        error: errorMessage(e),
      });
    });
  }

  // ─── Orchestrator ─────────────────────────────────────

  const activateDesktopApp = () =>
    activateDesktop((hostName, message) => browser.runtime.sendNativeMessage(hostName, message));

  const orchestrator = new DownloadOrchestrator({
    downloads: {
      cancel: (id) => browser.downloads.cancel(id),
      erase: (query) => browser.downloads.erase(query).then(() => {}),
      download: (options) => browser.downloads.download(options),
    },
    cookies: {
      getAll: async (details) => {
        const granted = await hasCookieForwardingAccess().catch((e) => {
          logWarn('permission_check_failed', 'Cookie permission check failed', {
            permission: 'cookies',
            error: errorMessage(e),
          });
          return false;
        });
        return granted ? browser.cookies.getAll(details) : [];
      },
    },
    diagnosticLog: {
      append: diagnosticLog.append,
    },
    getSettings: () => settings,
    getSiteRules: () => siteRules,
    duplicateGuard: duplicateDownloadGuard,
    desktopClient,
    activateDesktop: (timeoutMs) =>
      activateDesktopAndWait({
        activate: activateDesktopApp,
        checkReady: () => desktopClient.isReady(),
        maxWaitMs: timeoutMs,
      }),
    onDuplicateBlocked: () => {
      const payload = buildDuplicateDownloadNotification(
        bgI18n.t('notification_duplicate_guard_title', 'Task submitted'),
        bgI18n.t('notification_duplicate_guard_body', 'Duplicate request skipped'),
      );
      try {
        void Promise.resolve(browser.notifications.create(payload.id, payload.options)).catch(
          (error) => {
            logWarn('notification_failed', 'Duplicate notification could not be shown', {
              error: errorMessage(error),
            });
          },
        );
      } catch (error) {
        logWarn('notification_failed', 'Duplicate notification could not be shown', {
          error: errorMessage(error),
        });
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
      logWarn('request_headers_failed', 'Request header listener is unavailable', {
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
        if (degraded) {
          logWarn('request_headers_degraded', 'Request header listener has limited access', {
            browser: browserName,
            extraHeaders: false,
          });
        }
        return;
      } catch (e) {
        if (extraInfoSpec === fullSpec && !fullSpec.includes('extraHeaders')) {
          // Degraded spec would be identical — report and stop.
          logWarn('request_headers_failed', 'Request header listener could not be registered', {
            browser: browserName,
            error: errorMessage(e),
          });
          return;
        }
        if (extraInfoSpec !== fullSpec) {
          logWarn('request_headers_failed', 'Request header listener could not be registered', {
            browser: browserName,
            error: errorMessage(e),
          });
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
            logError('download_handler_failed', 'Firefox response takeover failed', {
              url: parsed.url,
              mime: parsed.mime,
              error: errorMessage(error),
            });
          });
          return { cancel: true };
        },
        { urls: ALL_HTTP_URLS, types: ['main_frame', 'sub_frame'] },
        ['blocking', 'responseHeaders'],
      );
    } catch (e) {
      logWarn('firefox_interception_failed', 'Firefox response interception is unavailable', {
        error: errorMessage(e),
      });
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
      return ['http:', 'https:'].includes(new URL(item.url).protocol);
    } catch {
      return false;
    }
  }

  function logDownloadHandlerError(item: Browser.downloads.DownloadItem, error: unknown): void {
    logError('download_handler_failed', 'Download handler failed', {
      url: item.url,
      mime: item.mime || '',
      error: errorMessage(error),
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
      () => {
        const error = browser.runtime.lastError;
        const message = error?.message ?? '';
        if (message && !message.includes('duplicate')) {
          logWarn('context_menu_failed', 'Context menu could not be registered', {
            error: message,
          });
        }
      },
    );
  }

  browser.contextMenus.onClicked.addListener((info) => {
    const rawUrl = extractContextMenuUrl(info);
    if (!rawUrl) return;

    void ensureConfigLoaded().then(async () => {
      try {
        await orchestrator.sendUrl(rawUrl, info.pageUrl ?? '', { source: 'context-menu' });
      } catch {
        // The orchestrator records the terminal delivery failure.
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
    if (browserMode && !(await desktopClient.isReady())) {
      logWarn('download_restored_to_browser', 'Browser retained the protocol link', {
        url: msg.url,
        protocol: msg.protocol,
        reason: 'desktop-unavailable',
        mode: 'continued',
      });
      return { disposition: 'browser' };
    }

    try {
      await orchestrator.sendUrl(msg.url, '', {
        source: 'external-protocol',
        allowActivation: !browserMode,
      });
      return { disposition: 'handled' };
    } catch {
      // The orchestrator records the terminal delivery failure.
      return { disposition: browserMode ? 'browser' : 'handled' };
    }
  }

  async function handleDesktopActivation(): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      await activateDesktopApp();
      return { ok: true };
    } catch (error) {
      const code = error instanceof DesktopActivationError ? error.code : 'unknown';
      logError('desktop_activation_failed', 'Motrix Next could not be activated', {
        source: 'popup',
        reason: code,
      });
      return { ok: false, error: code };
    }
  }

  async function handleDesktopCommand(
    action: 'pause-all' | 'resume-all',
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    await ensureConfigLoaded();
    try {
      if (action === 'pause-all') await desktopClient.pauseAll();
      else await desktopClient.resumeAll();
      return { ok: true };
    } catch (error) {
      const authFailure = error instanceof ApiAuthError;
      logError(
        authFailure ? 'api_auth_failed' : 'api_unreachable',
        authFailure
          ? 'Motrix Next rejected the API credentials'
          : 'Motrix Next could not complete the requested action',
        { source: 'popup', action, error: errorMessage(error) },
      );
      return { ok: false, error: errorMessage(error) };
    }
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (msg === null || typeof msg !== 'object') return undefined;
    if ('type' in msg && msg.type === 'ACTIVATE_DESKTOP') return handleDesktopActivation();
    if ('type' in msg && msg.type === 'CLEAR_DIAGNOSTICS') {
      return diagnosticLog.clear().then(() => ({ ok: true as const }));
    }
    if ('type' in msg && msg.type === 'GET_DIAGNOSTICS') {
      return diagnosticLog.initialize().then(() => ({
        ok: true as const,
        events: diagnosticLog.getAll(),
      }));
    }
    if ('type' in msg && msg.type === 'PAUSE_ALL') return handleDesktopCommand('pause-all');
    if ('type' in msg && msg.type === 'RESUME_ALL') return handleDesktopCommand('resume-all');
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
      void browser.contextMenus
        .update(CONTEXT_MENU_ID, { title: contextMenuTitle() })
        .catch((error) => {
          logWarn('context_menu_failed', 'Context menu title could not be updated', {
            error: errorMessage(error),
          });
        });
    }
  });

  // ─── Lifecycle ────────────────────────────────────────

  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      logInfo('extension_installed', 'Extension installed');
    } else if (details.reason === 'update') {
      logInfo('extension_updated', 'Extension was updated', {
        previousVersion: details.previousVersion ?? 'unknown',
        currentVersion: browser.runtime.getManifest().version,
      });
    }
  });

  browser.permissions.onAdded?.addListener((permissions) => {
    logInfo('permission_granted', 'Browser permissions were granted', {
      permissions: permissions.permissions?.join(', ') ?? '',
      origins: permissions.origins?.join(', ') ?? '',
    });
  });

  browser.permissions.onRemoved?.addListener((permissions) => {
    logWarn('permission_revoked', 'Browser permissions were revoked', {
      permissions: permissions.permissions?.join(', ') ?? '',
      origins: permissions.origins?.join(', ') ?? '',
    });
  });

  void diagnosticLog.initialize();
  void ensureConfigLoaded().then(() => {
    // Register the context menu after the locale is loaded (i18n timing).
    registerContextMenu();
    applyDownloadBarPreferenceSafely();
  });
});
