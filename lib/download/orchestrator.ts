import type { DownloadSettings, SiteRule, FilterContext } from '@/shared/types';
import type { DiagnosticInput } from '@/lib/storage/diagnostic-log';
import { evaluateFilterPipeline, createFilterPipeline } from './filter';
import { decodeMimeEncodedWords, extractFilenameFromUrl } from '@/shared/url';
import {
  normalizeFilename,
  UNRESOLVED_FILENAME,
  type FilenameMetadata,
  type FilenameSource,
} from './filename-metadata';
import type { DesktopApiClient } from '@/lib/api/desktop-client';
import { ApiAuthError } from '@/shared/errors';
import { isCookieCollectableUrl } from '@/lib/services/magnet-interception';
import type { RequestHeaderContext, RequestHeaderMatchReason } from './request-context';
import type {
  DuplicateDownloadGuard,
  DuplicateDownloadReservation,
  DuplicateDownloadInput,
} from './duplicate-guard';
import { AutomaticDownloadHandoff } from './automatic-handoff';

// ─── Dependency Interface ───────────────────────────────

/**
 * Minimal dependency interface for the download orchestrator.
 *
 * Automatic browser downloads use the HTTP API and preserve the native
 * download until the desktop app accepts the task. Explicit user commands
 * may use the protocol deep-link when the API is unavailable.
 */
export interface OrchestratorDeps {
  downloads: {
    pause: (id: number) => Promise<void>;
    resume: (id: number) => Promise<void>;
    cancel: (id: number) => Promise<void>;
    erase: (query: { id: number }) => Promise<void>;
  };
  /** Optional browser cookies API for forwarding auth cookies to the desktop app. */
  cookies?: {
    getAll: (details: { url: string }) => Promise<Array<{ name: string; value: string }>>;
  };
  diagnosticLog: {
    append: (event: DiagnosticInput) => void;
  };
  getSettings: () => DownloadSettings;
  getSiteRules: () => SiteRule[];
  filenameMetadata?: {
    resolve: (item: DownloadItem) => Promise<FilenameMetadata | undefined>;
  };
  duplicateGuard?: DuplicateDownloadGuard;
  /**
   * HTTP API client for direct communication with the desktop app.
   * When available and reachable, this is the primary download submission path.
   */
  desktopClient?: DesktopApiClient;
  /**
   * Wake the desktop app via protocol handler and wait for the HTTP API
   * to become reachable. Returns true if the app woke up successfully.
   * Automatic downloads use the configured startup timeout. Explicit commands
   * may continue to the raw deep-link when the wait expires.
   */
  wakeDesktop?: (timeoutMs: number) => Promise<boolean>;
  /**
   * Fallback: route a URL to the desktop app via `motrixnext://new?url=...`
   * deep link. Used only when both HTTP API and wake+retry fail.
   */
  openProtocolNewTask?: (url: string, referer: string, filename?: string) => Promise<void>;
  onDuplicateBlocked?: () => void;
}

/** Download data shared by browser download and Firefox response interception. */
export interface DownloadCandidate {
  url: string;
  finalUrl: string;
  filename: string;
  fileSize: number;
  totalBytes: number;
  mime: string;
  byExtensionId?: string;
  referrer?: string;
  requestHeaderContext?: RequestHeaderContext;
  requestHeaderDiagnostics?: RequestHeaderDiagnostics;
}

/** Shape of a browser DownloadItem as received from chrome.downloads events. */
export interface DownloadItem extends DownloadCandidate {
  id: number;
  state: string;
}

const GENERIC_FILENAME_HINTS = new Set(['download', UNRESOLVED_FILENAME]);
type FilenameHintSource = FilenameSource | 'download-item' | 'url';
type HeaderMatchSource = 'finalUrl' | 'url';

export interface RequestHeaderDiagnostics {
  enabled: boolean;
  matched: boolean;
  reason: RequestHeaderMatchReason | 'disabled';
  source?: HeaderMatchSource;
  ageMs?: number;
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0 || dot === filename.length - 1) return '';
  return filename.slice(dot + 1).toLowerCase();
}

function filenameStem(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(0, dot) : filename;
}

function extractPathBasename(url: string): string {
  try {
    const parsed = new URL(url);
    const raw = parsed.pathname.split('/').filter(Boolean).pop() ?? '';
    return normalizeFilename(decodeURIComponent(raw));
  } catch {
    return '';
  }
}

function isWeakBrowserFilename(url: string, filename: string): boolean {
  const lower = filename.toLowerCase();
  const stem = filenameStem(filename).toLowerCase();
  if (GENERIC_FILENAME_HINTS.has(lower) || GENERIC_FILENAME_HINTS.has(stem)) return true;

  const pathBasename = extractPathBasename(url);
  const pathHasExtension = extensionOf(pathBasename) !== '';
  if (pathBasename && !pathHasExtension && stem === pathBasename.toLowerCase()) return true;

  return /^\d+$/.test(stem) && !pathHasExtension;
}

function resolveFilenameHint(
  url: string,
  candidate: { filename: string; source: FilenameHintSource },
): string | undefined {
  const trimmed = normalizeFilename(decodeMimeEncodedWords(candidate.filename));
  if (!trimmed) return undefined;
  if (candidate.source !== 'content-disposition' && candidate.source !== 'url') {
    if (isWeakBrowserFilename(url, trimmed)) return undefined;
  }
  const urlFilename = extractFilenameFromUrl(url);
  if (urlFilename) {
    const hintExt = extensionOf(trimmed);
    const urlExt = extensionOf(urlFilename);
    if (candidate.source !== 'content-disposition' && hintExt && urlExt && hintExt !== urlExt) {
      return undefined;
    }
  }
  return trimmed;
}

function resolveBestFilenameHint(
  url: string,
  metadata: FilenameMetadata | undefined,
  itemFilename: string,
): { filename?: string; source: string } {
  const candidates: Array<{ filename: string; source: FilenameHintSource }> = [];
  if (metadata) candidates.push(metadata);
  candidates.push({ filename: itemFilename, source: 'download-item' });

  for (const candidate of candidates) {
    const filename = resolveFilenameHint(url, candidate);
    if (filename) return { filename, source: candidate.source };
  }

  return { source: 'none' };
}

// ─── Orchestrator ───────────────────────────────────────

/**
 * Central download interception orchestrator.
 *
 * Automatic flow:
 *   filter → confirm desktop availability → pause browser download →
 *   submit to desktop → cancel browser download, or resume on failure
 *
 * Explicit flow:
 *   submit through HTTP → wake and retry → protocol deep-link
 */
export class DownloadOrchestrator {
  private readonly deps: OrchestratorDeps;
  private readonly filterStages;
  private readonly automaticHandoff: AutomaticDownloadHandoff;

  constructor(deps: OrchestratorDeps) {
    this.deps = deps;
    this.filterStages = createFilterPipeline(() => deps.getSiteRules());
    this.automaticHandoff = new AutomaticDownloadHandoff(deps);
  }

  /**
   * Handle a download interception event.
   *
   * Called from `onCreated` — fires for every new download item.
   *
   * @returns `true` if the download was intercepted (cancel called),
   *          `false` if the browser should continue normally.
   */
  async handleCreated(item: DownloadItem): Promise<boolean> {
    // ─── State guard ────────────────────────────
    // Chrome may replay `onCreated` for interrupted or completed downloads
    // after system reboots or Service Worker restarts. Only genuinely new
    // downloads have state === 'in_progress'. Stale items (complete,
    // interrupted) must be ignored to prevent historical download floods (#267).
    if (item.state !== 'in_progress') {
      this.deps.diagnosticLog.append({
        level: 'info',
        code: 'download_skipped',
        message: `Skipped stale download (state=${item.state}): ${item.url}`,
        context: {
          url: item.url,
          state: item.state,
          stage: 'state-guard',
        },
      });
      return false;
    }

    if (this.automaticHandoff.consumeBrowserFallback(item)) {
      this.deps.diagnosticLog.append({
        level: 'info',
        code: 'download_skipped',
        message: `Continuing Firefox response in browser: ${item.url}`,
        context: { url: item.url, stage: 'firefox-response-fallback' },
      });
      return false;
    }

    const filterResult = this.evaluateCandidate(item);
    if (!filterResult) return false;
    const { tabUrl, stageName } = filterResult;

    const effectiveUrl = item.finalUrl || item.url;

    const duplicateDecision = this.reserveDuplicateDownload({
      url: item.url,
      finalUrl: item.finalUrl,
      filename: item.filename,
      fileSize: item.fileSize,
      totalBytes: item.totalBytes,
      mime: item.mime,
    });
    if (duplicateDecision.blocked) {
      await this.safeCancel(item.id);
      this.deps.diagnosticLog.append({
        level: 'info',
        code: 'download_duplicate_blocked',
        message: `Duplicate download blocked: ${effectiveUrl}`,
        context: {
          url: effectiveUrl,
          fileSize: item.fileSize,
          totalBytes: item.totalBytes,
          mime: item.mime,
          tabUrl,
          shouldNotify: duplicateDecision.shouldNotify,
        },
      });
      if (duplicateDecision.shouldNotify) this.deps.onDuplicateBlocked?.();
      return true;
    }

    if (!(await this.automaticHandoff.ensureDesktopAvailable(effectiveUrl))) {
      this.deps.duplicateGuard?.release(duplicateDecision.reservation);
      return false;
    }

    if (!(await this.automaticHandoff.pauseBrowserDownload(item.id))) {
      this.deps.duplicateGuard?.release(duplicateDecision.reservation);
      return false;
    }

    // ─── Route to desktop app ───────────────────
    const metadata = await this.resolveFilenameMetadata(item);
    const resolvedFilename = resolveBestFilenameHint(effectiveUrl, metadata, item.filename);
    const filenameHint = resolvedFilename.filename;
    const filenameSource = resolvedFilename.source;
    const displayName = filenameHint || extractFilenameFromUrl(effectiveUrl) || UNRESOLVED_FILENAME;
    const cookieResult = await this.resolveCookieHeader(effectiveUrl, item.requestHeaderContext);

    const routed = await this.sendToDesktop(
      effectiveUrl,
      effectiveUrl,
      tabUrl,
      cookieResult.value,
      cookieResult.source,
      displayName,
      filenameHint,
      filenameSource,
      item.requestHeaderContext,
      item.requestHeaderDiagnostics,
      { allowWake: false, allowProtocol: false },
    );
    if (!routed) {
      this.deps.duplicateGuard?.release(duplicateDecision.reservation);
      await this.automaticHandoff.resumeBrowserDownload(item.id);
      this.deps.diagnosticLog.append({
        level: 'warn',
        code: 'download_fallback',
        message: `Continuing in browser after desktop routing failed: ${displayName}`,
        context: { url: effectiveUrl, target: 'browser' },
      });
      return false;
    }

    await this.safeCancel(item.id);
    this.deps.duplicateGuard?.commit(duplicateDecision.reservation);
    this.deps.diagnosticLog.append({
      level: 'info',
      code: 'download_intercepted',
      message: `Intercepted: ${item.url}`,
      context: {
        url: item.url,
        fileSize: item.fileSize,
        totalBytes: item.totalBytes,
        mime: item.mime,
        tabUrl,
        ...(item.filename ? { filename: item.filename } : {}),
        ...(item.byExtensionId ? { byExtensionId: item.byExtensionId } : {}),
        ...(stageName ? { stage: stageName } : {}),
      },
    });
    return true;
  }

  /**
   * Route a Firefox attachment response before Firefox opens its save dialog.
   * The response is cancelled only after the desktop API acknowledges it.
   */
  async handleResponse(item: DownloadCandidate, metadata?: FilenameMetadata): Promise<boolean> {
    const filterResult = this.evaluateCandidate(item);
    if (!filterResult) return false;
    const { tabUrl } = filterResult;

    const effectiveUrl = item.finalUrl || item.url;
    if (!(await this.automaticHandoff.ensureDesktopAvailable(effectiveUrl))) {
      this.automaticHandoff.rememberBrowserFallback(effectiveUrl);
      return false;
    }

    const duplicateDecision = this.reserveDuplicateDownload({
      url: item.url,
      finalUrl: item.finalUrl,
      filename: item.filename,
      fileSize: item.fileSize,
      totalBytes: item.totalBytes,
      mime: item.mime,
    });
    if (duplicateDecision.blocked) {
      this.deps.diagnosticLog.append({
        level: 'info',
        code: 'download_duplicate_blocked',
        message: `Duplicate download blocked: ${effectiveUrl}`,
        context: { url: effectiveUrl, shouldNotify: duplicateDecision.shouldNotify },
      });
      if (duplicateDecision.shouldNotify) this.deps.onDuplicateBlocked?.();
      return true;
    }

    const resolvedFilename = resolveBestFilenameHint(effectiveUrl, metadata, item.filename);
    const filenameHint = resolvedFilename.filename;
    const displayName = filenameHint || extractFilenameFromUrl(effectiveUrl) || UNRESOLVED_FILENAME;
    const cookieResult = await this.resolveCookieHeader(effectiveUrl, item.requestHeaderContext);

    try {
      await this.submitToDesktopApi(
        effectiveUrl,
        effectiveUrl,
        tabUrl,
        cookieResult.value,
        cookieResult.source,
        displayName,
        filenameHint,
        resolvedFilename.source,
        item.requestHeaderContext,
        item.requestHeaderDiagnostics,
      );
    } catch (e) {
      this.deps.duplicateGuard?.release(duplicateDecision.reservation);
      this.automaticHandoff.rememberBrowserFallback(effectiveUrl);
      this.deps.diagnosticLog.append({
        level: e instanceof ApiAuthError ? 'error' : 'warn',
        code: e instanceof ApiAuthError ? 'api_auth_failed' : 'download_fallback',
        message: `Firefox response routing failed: ${e instanceof Error ? e.message : String(e)}`,
        context: { url: effectiveUrl },
      });
      return false;
    }

    this.deps.duplicateGuard?.commit(duplicateDecision.reservation);
    this.deps.diagnosticLog.append({
      level: 'info',
      code: 'download_intercepted',
      message: `Intercepted: ${item.url}`,
      context: {
        url: item.url,
        fileSize: item.fileSize,
        totalBytes: item.totalBytes,
        mime: item.mime,
        tabUrl,
        ...(item.filename ? { filename: item.filename } : {}),
      },
    });
    return true;
  }

  private evaluateCandidate(
    item: DownloadCandidate,
  ): { tabUrl: string; stageName: string | null } | null {
    const tabUrl = item.requestHeaderContext?.referer || item.referrer || '';
    const ctx: FilterContext = {
      url: item.url,
      finalUrl: item.finalUrl,
      filename: item.filename,
      fileSize: item.fileSize,
      totalBytes: item.totalBytes,
      mimeType: item.mime,
      tabUrl,
      byExtensionId: item.byExtensionId,
    };
    const { verdict, stageName } = evaluateFilterPipeline(
      ctx,
      this.deps.getSettings(),
      this.filterStages,
    );

    if (verdict === 'skip') {
      this.deps.diagnosticLog.append({
        level: 'info',
        code: 'download_skipped',
        message: `Skipped by ${stageName ?? 'unknown'}: ${item.url}`,
        context: {
          url: item.url,
          stage: stageName ?? 'unknown',
          fileSize: item.fileSize,
          totalBytes: item.totalBytes,
          mime: item.mime,
          tabUrl,
          ...(item.byExtensionId ? { byExtensionId: item.byExtensionId } : {}),
        },
      });
      return null;
    }

    return { tabUrl, stageName };
  }

  /**
   * Send a URL to the desktop app (e.g. from context menu or magnet interception).
   *
   * @returns `'routed-to-desktop'` sentinel on success
   * @throws when no routing path is available
   */
  async sendUrl(url: string, tabUrl: string): Promise<string> {
    const extractedFilename = extractFilenameFromUrl(url) ?? '';
    const filenameHint = extractedFilename
      ? resolveFilenameHint(url, { filename: extractedFilename, source: 'url' })
      : undefined;
    const displayName = filenameHint || url.split('/').pop() || 'download';
    const duplicateDecision = this.reserveDuplicateDownload({
      url,
      finalUrl: url,
      filename: displayName,
      fileSize: -1,
      totalBytes: -1,
      mime: '',
    });
    if (duplicateDecision.blocked) {
      this.deps.diagnosticLog.append({
        level: 'info',
        code: 'download_duplicate_blocked',
        message: `Duplicate download blocked: ${url}`,
        context: { url, shouldNotify: duplicateDecision.shouldNotify },
      });
      if (duplicateDecision.shouldNotify) this.deps.onDuplicateBlocked?.();
      return 'duplicate-blocked';
    }

    const cookieResult = await this.resolveCookieHeader(url);

    const routed = await this.sendToDesktop(
      url,
      undefined,
      tabUrl,
      cookieResult.value,
      cookieResult.source,
      displayName,
      filenameHint,
      'url',
    );
    if (!routed) {
      this.deps.duplicateGuard?.release(duplicateDecision.reservation);
      throw new Error(
        'Desktop app routing unavailable: neither HTTP API nor protocol handler provided',
      );
    }

    this.deps.duplicateGuard?.commit(duplicateDecision.reservation);
    return 'routed-to-desktop';
  }

  // ─── Private Helpers ──────────────────────────────

  /**
   * Try HTTP API first, then fall back to deep-link protocol.
   * @returns `true` if successfully routed, `false` if all paths failed.
   */
  private async sendToDesktop(
    url: string,
    finalUrl: string | undefined,
    referer: string,
    cookie: string,
    cookieSource: string,
    displayName: string,
    filenameHint?: string,
    filenameSource: string = 'none',
    requestHeaderContext?: RequestHeaderContext,
    requestHeaderDiagnostics?: RequestHeaderDiagnostics,
    options: { allowWake: boolean; allowProtocol: boolean } = {
      allowWake: true,
      allowProtocol: true,
    },
  ): Promise<boolean> {
    const headerLogContext = this.buildHeaderLogContext(
      requestHeaderContext,
      requestHeaderDiagnostics,
    );

    // Primary: HTTP API
    if (this.deps.desktopClient) {
      try {
        await this.submitToDesktopApi(
          url,
          finalUrl,
          referer,
          cookie,
          cookieSource,
          displayName,
          filenameHint,
          filenameSource,
          requestHeaderContext,
          requestHeaderDiagnostics,
        );
        return true;
      } catch (e) {
        if (e instanceof ApiAuthError) {
          this.deps.diagnosticLog.append({
            level: 'error',
            code: 'api_auth_failed',
            message: `HTTP API authentication failed: ${e.message}`,
            context: { url },
          });
          return false;
        }

        // HTTP API failed — attempt wake + retry before falling back to deep-link
        this.deps.diagnosticLog.append({
          level: 'warn',
          code: 'download_fallback',
          message: `HTTP API failed, attempting wake: ${e instanceof Error ? e.message : String(e)}`,
          context: { url, ...headerLogContext },
        });

        // Wake → retry: try to start the desktop app and retry via HTTP
        const settings = this.deps.getSettings();
        if (
          settings.desktopUnavailable.action === 'launch' &&
          options.allowWake &&
          this.deps.wakeDesktop &&
          this.deps.desktopClient
        ) {
          this.deps.diagnosticLog.append({
            level: 'info',
            code: 'download_wake_attempt',
            message: `Waking desktop app for: ${displayName}`,
            context: { url, ...headerLogContext },
          });

          try {
            const woke = await this.deps.wakeDesktop(
              settings.desktopUnavailable.startupTimeoutSeconds * 1000,
            );
            if (woke) {
              this.deps.diagnosticLog.append({
                level: 'info',
                code: 'wake_success',
                message: `Desktop app woke successfully for: ${displayName}`,
                context: { url, ...headerLogContext },
              });

              await this.submitToDesktopApi(
                url,
                finalUrl,
                referer,
                cookie,
                cookieSource,
                displayName,
                filenameHint,
                filenameSource,
                requestHeaderContext,
                requestHeaderDiagnostics,
                true,
              );
              return true;
            }

            // Wake returned false — timed out
            this.deps.diagnosticLog.append({
              level: 'warn',
              code: 'wake_timeout',
              message: `Wake timed out for: ${displayName}`,
              context: { url, ...headerLogContext },
            });
          } catch (wakeError) {
            if (wakeError instanceof ApiAuthError) {
              this.deps.diagnosticLog.append({
                level: 'error',
                code: 'api_auth_failed',
                message: `HTTP API authentication failed after wake: ${wakeError.message}`,
                context: { url },
              });
              return false;
            }

            // Wake or retry-after-wake failed — log and fall through to deep-link
            this.deps.diagnosticLog.append({
              level: 'warn',
              code: 'download_fallback',
              message: `Wake+retry failed, falling back to deep-link: ${wakeError instanceof Error ? wakeError.message : String(wakeError)}`,
              context: { url, ...headerLogContext },
            });
          }
        } else if (settings.desktopUnavailable.action === 'browser') {
          this.deps.diagnosticLog.append({
            level: 'info',
            code: 'download_fallback',
            message: `Browser fallback selected, skipping wake for: ${displayName}`,
            context: { url, ...headerLogContext },
          });
        }
      }
    }

    // Fallback: deep-link protocol
    if (options.allowProtocol && this.deps.openProtocolNewTask) {
      const protocolFilenameHint =
        filenameHint !== extractFilenameFromUrl(url) ? filenameHint : undefined;
      if (protocolFilenameHint) {
        await this.deps.openProtocolNewTask(url, referer, protocolFilenameHint);
      } else {
        await this.deps.openProtocolNewTask(url, referer);
      }

      this.deps.diagnosticLog.append({
        level: 'info',
        code: 'download_routed',
        message: `Routed via deep-link: ${displayName}`,
        context: {
          url,
          filename: displayName,
          filenameSource,
          hasCookie: false,
          cookieSource: 'none',
          ...this.buildDeepLinkHeaderLogContext(requestHeaderDiagnostics),
        },
      });
      return true;
    }

    return false;
  }

  private async submitToDesktopApi(
    url: string,
    finalUrl: string | undefined,
    referer: string,
    cookie: string,
    cookieSource: string,
    displayName: string,
    filenameHint?: string,
    filenameSource: string = 'none',
    requestHeaderContext?: RequestHeaderContext,
    requestHeaderDiagnostics?: RequestHeaderDiagnostics,
    afterWake = false,
  ): Promise<void> {
    if (!this.deps.desktopClient) throw new Error('Desktop API unavailable');

    const response = await this.deps.desktopClient.addDownload({
      url,
      finalUrl: finalUrl || undefined,
      referer: referer || undefined,
      cookie: cookie || undefined,
      ...(filenameHint ? { filename: filenameHint } : {}),
      ...(requestHeaderContext?.userAgent ? { userAgent: requestHeaderContext.userAgent } : {}),
      ...(requestHeaderContext?.requestHeaders.length
        ? { requestHeaders: requestHeaderContext.requestHeaders }
        : {}),
    });

    this.deps.diagnosticLog.append({
      level: 'info',
      code: 'download_routed',
      message: `Routed via HTTP API${afterWake ? ' (after wake)' : ''}: ${displayName} (${response.action})`,
      context: {
        url,
        filename: displayName,
        filenameSource,
        action: response.action,
        ...(response.gid ? { gid: response.gid } : {}),
        hasCookie: cookie.length > 0,
        cookieSource,
        ...this.buildHeaderLogContext(requestHeaderContext, requestHeaderDiagnostics),
        ...(afterWake ? { afterWake: true } : {}),
      },
    });
  }

  private buildHeaderLogContext(
    context: RequestHeaderContext | undefined,
    diagnostics: RequestHeaderDiagnostics | undefined,
  ): {
    requestHeadersEnabled: boolean;
    hasUserAgent: boolean;
    headerCount: number;
    matchedHeaderContext: boolean;
    headerMatchReason: string;
    headerMatchSource?: string;
    headerAgeMs?: number;
  } {
    return {
      requestHeadersEnabled: diagnostics?.enabled ?? false,
      hasUserAgent: Boolean(context?.userAgent),
      headerCount: context?.requestHeaders.length ?? 0,
      matchedHeaderContext: diagnostics?.matched ?? Boolean(context),
      headerMatchReason: diagnostics?.reason ?? (context ? 'matched' : 'not-found'),
      ...(diagnostics?.source ? { headerMatchSource: diagnostics.source } : {}),
      ...(diagnostics?.ageMs !== undefined ? { headerAgeMs: diagnostics.ageMs } : {}),
    };
  }

  private reserveDuplicateDownload(
    input: DuplicateDownloadInput,
  ):
    | { blocked: true; shouldNotify: boolean }
    | { blocked: false; reservation?: DuplicateDownloadReservation } {
    return this.deps.duplicateGuard
      ? this.deps.duplicateGuard.reserve(input, this.deps.getSettings().duplicateGuard)
      : { blocked: false };
  }

  private buildDeepLinkHeaderLogContext(diagnostics: RequestHeaderDiagnostics | undefined): {
    requestHeadersEnabled: boolean;
    hasUserAgent: boolean;
    headerCount: number;
    matchedHeaderContext: boolean;
    headerMatchReason: string;
    headerMatchSource?: string;
    headerAgeMs?: number;
    headerForwardingSkippedReason: string;
  } {
    return {
      ...this.buildHeaderLogContext(undefined, diagnostics),
      hasUserAgent: false,
      headerCount: 0,
      headerForwardingSkippedReason: 'deep-link',
    };
  }

  /**
   * Cancel and erase a browser download, ignoring errors if the download
   * has already been cancelled or removed.
   */
  private async safeCancel(id: number): Promise<void> {
    try {
      await this.deps.downloads.cancel(id);
    } catch (e) {
      this.deps.diagnosticLog.append({
        level: 'warn',
        code: 'download_cancel_failed',
        message: `Cancel failed for download ${id}: ${e instanceof Error ? e.message : String(e)}`,
        context: { downloadId: id },
      });
    }
    try {
      await this.deps.downloads.erase({ id });
    } catch {
      /* already removed from history — benign */
    }
  }

  /**
   * Collect browser cookies for the given URL.
   */
  private async collectCookies(url: string): Promise<string> {
    if (!this.deps.getSettings().forwardCookies) {
      return '';
    }
    if (!isCookieCollectableUrl(url)) {
      return '';
    }
    if (!this.deps.cookies) {
      return '';
    }
    try {
      const cookies = await this.deps.cookies.getAll({ url });
      if (!cookies.length) return '';
      return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    } catch (e) {
      this.deps.diagnosticLog.append({
        level: 'warn',
        code: 'cookie_collect_failed',
        message: `Cookie collection failed: ${e instanceof Error ? e.message : String(e)}`,
        context: { url },
      });
      return ''; // Graceful degradation — never block the download
    }
  }

  private async resolveCookieHeader(
    url: string,
    requestHeaderContext?: RequestHeaderContext,
  ): Promise<{ value: string; source: string }> {
    if (!this.deps.getSettings().forwardCookies) {
      return { value: '', source: 'disabled' };
    }
    const captured = requestHeaderContext?.cookie?.trim();
    if (captured) {
      return { value: captured, source: 'request-header' };
    }
    const collected = await this.collectCookies(url);
    return { value: collected, source: collected ? 'cookies-api' : 'none' };
  }

  private async resolveFilenameMetadata(item: DownloadItem): Promise<FilenameMetadata | undefined> {
    if (!this.deps.filenameMetadata) return undefined;
    try {
      return await this.deps.filenameMetadata.resolve(item);
    } catch (e) {
      this.deps.diagnosticLog.append({
        level: 'warn',
        code: 'download_fallback',
        message: `Filename metadata resolution failed: ${e instanceof Error ? e.message : String(e)}`,
        context: { url: item.finalUrl || item.url },
      });
      return undefined;
    }
  }
}
