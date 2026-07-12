/**
 * Central download interception orchestrator.
 *
 * Automatic flow (browser download / Firefox response):
 *   filter → duplicate guard → unavailable policy → cancel browser download
 *   when intercepting → activate desktop if required → submit over HTTP.
 *   Automatic downloads never fall back to the deep-link protocol — they
 *   either reach the desktop app or stay in / return to the browser.
 *
 * Explicit flow (context menu, protocol links):
 *   submit over HTTP → wake and retry → deep-link protocol.
 */
import type { DownloadSettings, SiteRule } from '@/lib/schema';
import type { DiagnosticInput } from '@/lib/diagnostics';
import { ApiAuthError, type DesktopApiClient } from '@/lib/api';
import { createFilterPipeline, evaluateFilterPipeline, type FilterContext } from './filter';
import { decodeMimeEncodedWords, extractFilenameFromUrl, isCookieCollectableUrl } from './url';
import {
  normalizeFilename,
  UNRESOLVED_FILENAME,
  type FilenameMetadata,
  type FilenameSource,
} from './filename-metadata';
import type { RequestHeaderContext, RequestHeaderMatchReason } from './request-context';
import type {
  DuplicateDownloadGuard,
  DuplicateDownloadInput,
  DuplicateDownloadReservation,
} from './duplicate-guard';

// ─── Types ──────────────────────────────────────────────

export interface OrchestratorDeps {
  downloads: {
    cancel: (id: number) => Promise<void>;
    erase: (query: { id: number }) => Promise<void>;
  };
  /** Optional cookies API for forwarding auth cookies to the desktop app. */
  cookies?: {
    getAll: (details: { url: string }) => Promise<Array<{ name: string; value: string }>>;
  };
  diagnosticLog: { append: (event: DiagnosticInput) => void };
  getSettings: () => DownloadSettings;
  getSiteRules: () => SiteRule[];
  filenameMetadata?: {
    resolve: (item: DownloadItem) => Promise<FilenameMetadata | undefined>;
  };
  duplicateGuard?: DuplicateDownloadGuard;
  /** Primary submission path when reachable. */
  desktopClient?: DesktopApiClient;
  /**
   * Wake the desktop app via protocol handler and wait for its HTTP API.
   * Returns true when the app became reachable within the timeout.
   */
  wakeDesktop?: (timeoutMs: number) => Promise<boolean>;
  /** Last-resort deep link (`motrixnext://new?url=...`) for explicit commands. */
  openProtocolNewTask?: (url: string, referer: string, filename?: string) => Promise<void>;
  onDuplicateBlocked?: () => void;
}

/** Download data shared by browser downloads and Firefox response interception. */
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

export interface RequestHeaderDiagnostics {
  enabled: boolean;
  matched: boolean;
  reason: RequestHeaderMatchReason | 'disabled';
  source?: 'finalUrl' | 'url';
}

/** Everything needed to submit one download to the desktop app. */
interface DownloadJob {
  url: string;
  finalUrl?: string;
  referer: string;
  cookie: { value: string; source: string };
  displayName: string;
  filenameHint?: string;
  filenameSource: string;
  headerContext?: RequestHeaderContext;
  headerDiagnostics?: RequestHeaderDiagnostics;
}

interface SendOptions {
  allowWake: boolean;
  allowProtocol: boolean;
}

// ─── Filename Heuristics ────────────────────────────────
// These guards encode real-world fixes: browsers synthesize weak names
// ("download", numeric ids) that must not override URL/header-derived names.

const GENERIC_FILENAME_HINTS = new Set(['download', UNRESOLVED_FILENAME]);
type FilenameHintSource = FilenameSource | 'download-item' | 'url';

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
    const raw = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
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
  if (urlFilename && candidate.source !== 'content-disposition') {
    const hintExt = extensionOf(trimmed);
    const urlExt = extensionOf(urlFilename);
    if (hintExt && urlExt && hintExt !== urlExt) return undefined;
  }
  return trimmed;
}

function resolveBestFilenameHint(
  url: string,
  metadata: FilenameMetadata | undefined,
  itemFilename: string,
): { filename?: string; source: string } {
  const candidates: Array<{ filename: string; source: FilenameHintSource }> = [
    ...(metadata ? [metadata] : []),
    { filename: itemFilename, source: 'download-item' as const },
  ];
  for (const candidate of candidates) {
    const filename = resolveFilenameHint(url, candidate);
    if (filename) return { filename, source: candidate.source };
  }
  return { source: 'none' };
}

// ─── Orchestrator ───────────────────────────────────────

const BROWSER_FALLBACK_TTL_MS = 30_000;

export class DownloadOrchestrator {
  private readonly filterStages;
  /** Firefox responses kept in the browser; their onCreated echo must pass through. */
  private readonly browserFallbacks = new Map<string, number>();

  constructor(private readonly deps: OrchestratorDeps) {
    this.filterStages = createFilterPipeline(() => deps.getSiteRules());
  }

  /**
   * Handle a `downloads.onCreated` event.
   *
   * @returns true if the download was intercepted (cancelled in the browser).
   */
  async handleCreated(item: DownloadItem): Promise<boolean> {
    // Chrome replays onCreated for interrupted/completed downloads after
    // reboots or Service Worker restarts. Only genuinely new downloads are
    // in_progress; stale items must be ignored to prevent historical
    // download floods (#267).
    if (item.state !== 'in_progress') {
      this.log('download_skipped', `Skipped stale download (state=${item.state}): ${item.url}`, {
        url: item.url,
        state: item.state,
        stage: 'state-guard',
      });
      return false;
    }

    if (this.consumeBrowserFallback(item)) {
      this.log('download_skipped', `Continuing Firefox response in browser: ${item.url}`, {
        url: item.url,
        stage: 'firefox-response-fallback',
      });
      return false;
    }

    const filterResult = this.evaluateCandidate(item);
    if (!filterResult) return false;
    const { tabUrl } = filterResult;
    const effectiveUrl = item.finalUrl || item.url;

    const duplicate = this.reserveDuplicate(item);
    if (duplicate.blocked) {
      await this.safeCancel(item.id);
      this.reportDuplicate(effectiveUrl, duplicate.shouldNotify, { tabUrl });
      return true;
    }

    const settings = this.deps.getSettings();
    if (settings.desktopUnavailable.action === 'browser') {
      if (!(await this.isDesktopReachable())) {
        this.deps.duplicateGuard?.release(duplicate.reservation);
        this.log(
          'download_fallback',
          `Continuing in browser because Motrix Next is unavailable: ${effectiveUrl}`,
          { url: effectiveUrl, target: 'browser' },
        );
        return false;
      }
      await this.safeCancel(item.id);
    } else {
      await this.safeCancel(item.id);
      if (!(await this.activateDesktop(effectiveUrl, settings))) {
        this.deps.duplicateGuard?.release(duplicate.reservation);
        return true;
      }
    }

    const job = await this.buildJob(item, await this.resolveFilenameMetadata(item), tabUrl);
    const routed = await this.sendToDesktop(job, { allowWake: false, allowProtocol: false });
    if (!routed) {
      this.deps.duplicateGuard?.release(duplicate.reservation);
      this.log('download_failed', `Discarded after desktop routing failed: ${job.displayName}`, {
        url: effectiveUrl,
        target: 'discard',
      });
      return true;
    }

    this.deps.duplicateGuard?.commit(duplicate.reservation);
    this.logIntercepted(item, tabUrl, filterResult.stageName);
    return true;
  }

  /**
   * Route a Firefox attachment response before the save dialog opens.
   * Browser mode keeps the response when desktop routing is unavailable;
   * launch mode cancels it when startup or routing fails.
   *
   * @returns true if the response should be cancelled.
   */
  async handleResponse(item: DownloadCandidate, metadata?: FilenameMetadata): Promise<boolean> {
    const filterResult = this.evaluateCandidate(item);
    if (!filterResult) return false;
    const { tabUrl } = filterResult;
    const effectiveUrl = item.finalUrl || item.url;

    const settings = this.deps.getSettings();
    if (settings.desktopUnavailable.action === 'browser') {
      if (!(await this.isDesktopReachable())) {
        this.browserFallbacks.set(effectiveUrl, Date.now() + BROWSER_FALLBACK_TTL_MS);
        return false;
      }
    } else if (!(await this.activateDesktop(effectiveUrl, settings))) {
      return true;
    }

    const duplicate = this.reserveDuplicate(item);
    if (duplicate.blocked) {
      this.reportDuplicate(effectiveUrl, duplicate.shouldNotify);
      return true;
    }

    const job = await this.buildJob(item, metadata, tabUrl);
    try {
      await this.submitToDesktopApi(job);
    } catch (e) {
      this.deps.duplicateGuard?.release(duplicate.reservation);
      const auth = e instanceof ApiAuthError;
      this.log(
        auth ? 'api_auth_failed' : 'download_fallback',
        `Firefox response routing failed: ${errorMessage(e)}`,
        { url: effectiveUrl },
        auth ? 'error' : 'warn',
      );
      return true;
    }

    this.deps.duplicateGuard?.commit(duplicate.reservation);
    this.logIntercepted(item, tabUrl, filterResult.stageName);
    return true;
  }

  /**
   * Send a URL to the desktop app (context menu, protocol links).
   *
   * @returns 'routed-to-desktop' or 'duplicate-blocked'.
   * @throws when no routing path succeeded.
   */
  async sendUrl(
    url: string,
    tabUrl: string,
    options: Partial<SendOptions> = {},
  ): Promise<'routed-to-desktop' | 'duplicate-blocked'> {
    const extracted = extractFilenameFromUrl(url) ?? '';
    const filenameHint = extracted
      ? resolveFilenameHint(url, { filename: extracted, source: 'url' })
      : undefined;
    const displayName = filenameHint || url.split('/').pop() || 'download';

    const duplicate = this.reserveDuplicate({
      url,
      finalUrl: url,
      filename: displayName,
      fileSize: -1,
      totalBytes: -1,
      mime: '',
    });
    if (duplicate.blocked) {
      this.reportDuplicate(url, duplicate.shouldNotify);
      return 'duplicate-blocked';
    }

    const routed = await this.sendToDesktop(
      {
        url,
        referer: tabUrl,
        cookie: await this.resolveCookieHeader(url),
        displayName,
        filenameHint,
        filenameSource: 'url',
      },
      { allowWake: options.allowWake ?? true, allowProtocol: options.allowProtocol ?? true },
    );
    if (!routed) {
      this.deps.duplicateGuard?.release(duplicate.reservation);
      throw new Error(
        'Desktop app routing unavailable: neither HTTP API nor protocol handler provided',
      );
    }

    this.deps.duplicateGuard?.commit(duplicate.reservation);
    return 'routed-to-desktop';
  }

  // ─── Candidate Evaluation ─────────────────────────────

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
      this.log('download_skipped', `Skipped by ${stageName ?? 'unknown'}: ${item.url}`, {
        url: item.url,
        stage: stageName ?? 'unknown',
        mime: item.mime,
        tabUrl,
      });
      return null;
    }
    return { tabUrl, stageName };
  }

  // ─── Desktop Activation ───────────────────────────────

  private async isDesktopReachable(): Promise<boolean> {
    return this.deps.desktopClient ? this.deps.desktopClient.isReachable() : false;
  }

  /** Launch-mode activation: wake the app and wait for its API. */
  private async activateDesktop(url: string, settings: DownloadSettings): Promise<boolean> {
    if (!this.deps.wakeDesktop) return this.isDesktopReachable();

    const timeoutMs = settings.desktopUnavailable.startupTimeoutSeconds * 1000;
    this.log('download_wake_attempt', `Waking desktop app for: ${url}`, { url, timeoutMs });

    try {
      if (await this.deps.wakeDesktop(timeoutMs)) {
        this.log('wake_success', `Desktop app woke successfully for: ${url}`, { url });
        return true;
      }
      this.log('wake_timeout', `Wake timed out for: ${url}`, { url, timeoutMs }, 'warn');
    } catch (e) {
      this.log(
        'download_fallback',
        `Motrix Next could not be started: ${errorMessage(e)}`,
        { url, target: 'discard' },
        'warn',
      );
    }
    return false;
  }

  private consumeBrowserFallback(item: { url: string; finalUrl: string }): boolean {
    const now = Date.now();
    for (const url of new Set([item.url, item.finalUrl].filter(Boolean))) {
      const expiresAt = this.browserFallbacks.get(url);
      if (expiresAt === undefined) continue;
      this.browserFallbacks.delete(url);
      if (expiresAt > now) return true;
    }
    return false;
  }

  // ─── Submission ───────────────────────────────────────

  private async buildJob(
    item: DownloadCandidate,
    metadata: FilenameMetadata | undefined,
    tabUrl: string,
  ): Promise<DownloadJob> {
    const effectiveUrl = item.finalUrl || item.url;
    const { filename, source } = resolveBestFilenameHint(effectiveUrl, metadata, item.filename);
    return {
      url: effectiveUrl,
      finalUrl: effectiveUrl,
      referer: tabUrl,
      cookie: await this.resolveCookieHeader(effectiveUrl, item.requestHeaderContext),
      displayName: filename || extractFilenameFromUrl(effectiveUrl) || UNRESOLVED_FILENAME,
      filenameHint: filename,
      filenameSource: source,
      headerContext: item.requestHeaderContext,
      headerDiagnostics: item.requestHeaderDiagnostics,
    };
  }

  /**
   * Try the HTTP API, then wake+retry, then the deep-link protocol.
   * @returns true if the download reached the desktop app by any path.
   */
  private async sendToDesktop(job: DownloadJob, options: SendOptions): Promise<boolean> {
    if (this.deps.desktopClient) {
      try {
        await this.submitToDesktopApi(job);
        return true;
      } catch (e) {
        if (e instanceof ApiAuthError) {
          this.log(
            'api_auth_failed',
            `HTTP API authentication failed: ${e.message}`,
            { url: job.url },
            'error',
          );
          return false;
        }
        this.log(
          'download_fallback',
          `HTTP API failed, attempting wake: ${errorMessage(e)}`,
          { url: job.url },
          'warn',
        );
        const wokeAndRetried = await this.wakeAndRetry(job, options);
        if (wokeAndRetried !== null) return wokeAndRetried;
      }
    }

    if (options.allowProtocol && this.deps.openProtocolNewTask) {
      const protocolFilenameHint =
        job.filenameHint !== extractFilenameFromUrl(job.url) ? job.filenameHint : undefined;
      if (protocolFilenameHint) {
        await this.deps.openProtocolNewTask(job.url, job.referer, protocolFilenameHint);
      } else {
        await this.deps.openProtocolNewTask(job.url, job.referer);
      }
      this.log('download_routed', `Routed via deep-link: ${job.displayName}`, {
        url: job.url,
        filename: job.displayName,
        filenameSource: job.filenameSource,
        transport: 'deep-link',
      });
      return true;
    }

    return false;
  }

  /**
   * Wake the desktop app and retry the HTTP submission.
   * @returns true/false when the attempt concluded the flow, null to
   *          continue to the deep-link fallback.
   */
  private async wakeAndRetry(job: DownloadJob, options: SendOptions): Promise<boolean | null> {
    const settings = this.deps.getSettings();
    if (
      settings.desktopUnavailable.action !== 'launch' ||
      !options.allowWake ||
      !this.deps.wakeDesktop
    ) {
      return null;
    }

    this.log('download_wake_attempt', `Waking desktop app for: ${job.displayName}`, {
      url: job.url,
    });
    try {
      const woke = await this.deps.wakeDesktop(
        settings.desktopUnavailable.startupTimeoutSeconds * 1000,
      );
      if (!woke) {
        this.log(
          'wake_timeout',
          `Wake timed out for: ${job.displayName}`,
          { url: job.url },
          'warn',
        );
        return null;
      }
      this.log('wake_success', `Desktop app woke successfully for: ${job.displayName}`, {
        url: job.url,
      });
      await this.submitToDesktopApi(job, true);
      return true;
    } catch (e) {
      if (e instanceof ApiAuthError) {
        this.log(
          'api_auth_failed',
          `HTTP API authentication failed after wake: ${e.message}`,
          { url: job.url },
          'error',
        );
        return false;
      }
      this.log(
        'download_fallback',
        `Wake+retry failed, falling back to deep-link: ${errorMessage(e)}`,
        { url: job.url },
        'warn',
      );
      return null;
    }
  }

  private async submitToDesktopApi(job: DownloadJob, afterWake = false): Promise<void> {
    if (!this.deps.desktopClient) throw new Error('Desktop API unavailable');

    const response = await this.deps.desktopClient.addDownload({
      url: job.url,
      finalUrl: job.finalUrl || undefined,
      referer: job.referer || undefined,
      cookie: job.cookie.value || undefined,
      ...(job.filenameHint ? { filename: job.filenameHint } : {}),
      ...(job.headerContext?.userAgent ? { userAgent: job.headerContext.userAgent } : {}),
      ...(job.headerContext?.requestHeaders.length
        ? { requestHeaders: job.headerContext.requestHeaders }
        : {}),
    });

    this.log(
      'download_routed',
      `Routed via HTTP API${afterWake ? ' (after wake)' : ''}: ${job.displayName} (${response.action})`,
      {
        url: job.url,
        filename: job.displayName,
        filenameSource: job.filenameSource,
        action: response.action,
        ...(response.gid ? { gid: response.gid } : {}),
        hasCookie: job.cookie.value.length > 0,
        cookieSource: job.cookie.source,
        headerCount: job.headerContext?.requestHeaders.length ?? 0,
        headerMatchReason:
          job.headerDiagnostics?.reason ?? (job.headerContext ? 'matched' : 'not-found'),
      },
    );
  }

  // ─── Duplicate Guard ──────────────────────────────────

  private reserveDuplicate(
    input: DuplicateDownloadInput,
  ):
    | { blocked: true; shouldNotify: boolean }
    | { blocked: false; reservation?: DuplicateDownloadReservation } {
    return this.deps.duplicateGuard
      ? this.deps.duplicateGuard.reserve(input, this.deps.getSettings().duplicateGuard)
      : { blocked: false };
  }

  private reportDuplicate(
    url: string,
    shouldNotify: boolean,
    extra: Record<string, string> = {},
  ): void {
    this.log('download_duplicate_blocked', `Duplicate download blocked: ${url}`, {
      url,
      shouldNotify,
      ...extra,
    });
    if (shouldNotify) this.deps.onDuplicateBlocked?.();
  }

  // ─── Cookies ──────────────────────────────────────────

  private async resolveCookieHeader(
    url: string,
    headerContext?: RequestHeaderContext,
  ): Promise<{ value: string; source: string }> {
    if (!this.deps.getSettings().forwardCookies) return { value: '', source: 'disabled' };

    const captured = headerContext?.cookie?.trim();
    if (captured) return { value: captured, source: 'request-header' };

    if (!this.deps.cookies || !isCookieCollectableUrl(url)) return { value: '', source: 'none' };
    try {
      const cookies = await this.deps.cookies.getAll({ url });
      const value = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      return { value, source: value ? 'cookies-api' : 'none' };
    } catch (e) {
      // Graceful degradation — never block the download on cookie failure.
      this.log(
        'cookie_collect_failed',
        `Cookie collection failed: ${errorMessage(e)}`,
        { url },
        'warn',
      );
      return { value: '', source: 'none' };
    }
  }

  // ─── Misc Helpers ─────────────────────────────────────

  private async resolveFilenameMetadata(item: DownloadItem): Promise<FilenameMetadata | undefined> {
    if (!this.deps.filenameMetadata) return undefined;
    try {
      return await this.deps.filenameMetadata.resolve(item);
    } catch (e) {
      this.log(
        'download_fallback',
        `Filename metadata resolution failed: ${errorMessage(e)}`,
        { url: item.finalUrl || item.url },
        'warn',
      );
      return undefined;
    }
  }

  /** Cancel and erase a browser download, tolerating already-gone items. */
  private async safeCancel(id: number): Promise<void> {
    try {
      await this.deps.downloads.cancel(id);
    } catch (e) {
      this.log(
        'download_cancel_failed',
        `Cancel failed for download ${id}: ${errorMessage(e)}`,
        { downloadId: id },
        'warn',
      );
    }
    await this.deps.downloads.erase({ id }).catch(() => {
      /* already removed from history — benign */
    });
  }

  private logIntercepted(item: DownloadCandidate, tabUrl: string, stageName: string | null): void {
    this.log('download_intercepted', `Intercepted: ${item.url}`, {
      url: item.url,
      totalBytes: item.totalBytes,
      mime: item.mime,
      tabUrl,
      ...(item.filename ? { filename: item.filename } : {}),
      ...(stageName ? { stage: stageName } : {}),
    });
  }

  private log(
    code: DiagnosticInput['code'],
    message: string,
    context?: DiagnosticInput['context'],
    level: DiagnosticInput['level'] = 'info',
  ): void {
    this.deps.diagnosticLog.append({ level, code, message, context });
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
