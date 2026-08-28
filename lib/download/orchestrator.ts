/**
 * Central download interception orchestrator.
 *
 * Automatic flow (Chromium takeover / Firefox response / Firefox fallback):
 *   filter → duplicate guard → unavailable policy → submit over HTTP.
 *   Chromium acquires ownership before this flow and recreates the browser
 *   download when browser fallback is required. Firefox blocks attachment
 *   responses before its native download starts.
 *
 * Explicit flow (context menu, protocol links):
 *   submit over HTTP → activate Motrix Next → retry over HTTP.
 */
import type { DownloadSettings, SiteRule } from '@/lib/schema';
import type { DiagnosticInput } from '@/lib/diagnostics';
import { ApiAuthError, type DesktopApiClient } from '@/lib/api';
import { createFilterPipeline, evaluateFilterPipeline, type FilterContext } from './filter';
import {
  decodeMimeEncodedWords,
  extractFilenameFromUrl,
  isCookieCollectableUrl,
  normalizeFilename,
} from './url';
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
    download: (options: { url: string }) => Promise<number>;
  };
  /** Optional cookies API for forwarding auth cookies to the desktop app. */
  cookies?: {
    getAll: (details: { url: string }) => Promise<Array<{ name: string; value: string }>>;
  };
  diagnosticLog: { append: (event: DiagnosticInput) => void };
  getSettings: () => DownloadSettings;
  getSiteRules: () => SiteRule[];
  duplicateGuard?: DuplicateDownloadGuard;
  /** Primary submission path when the desktop app and engine are ready. */
  desktopClient?: DesktopApiClient;
  /**
   * Activate the desktop app through Native Messaging and wait for its HTTP API.
   * Returns true when the desktop app and engine became ready within the timeout.
   */
  activateDesktop?: (timeoutMs: number) => Promise<boolean>;
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
  filenameSource?: 'browser-determined' | 'content-disposition';
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
  allowActivation: boolean;
}

// ─── Filename Heuristics ────────────────────────────────
// These guards encode real-world fixes: browsers synthesize weak names
// ("download", numeric ids) that must not override URL/header-derived names.

const UNRESOLVED_FILENAME = 'unresolved-filename';
const GENERIC_FILENAME_HINTS = new Set(['download', UNRESOLVED_FILENAME]);
type FilenameHintSource = 'browser-determined' | 'content-disposition' | 'download-item' | 'url';

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
  if (
    candidate.source !== 'browser-determined' &&
    candidate.source !== 'content-disposition' &&
    candidate.source !== 'url'
  ) {
    if (isWeakBrowserFilename(url, trimmed)) return undefined;
  }
  const urlFilename = extractFilenameFromUrl(url);
  if (
    urlFilename &&
    candidate.source !== 'browser-determined' &&
    candidate.source !== 'content-disposition'
  ) {
    const hintExt = extensionOf(trimmed);
    const urlExt = extensionOf(urlFilename);
    if (hintExt && urlExt && hintExt !== urlExt) return undefined;
  }
  return trimmed;
}

function resolveBestFilenameHint(
  url: string,
  item: Pick<DownloadCandidate, 'filename' | 'filenameSource'>,
): { filename?: string; source: string } {
  const candidates: Array<{ filename: string; source: FilenameHintSource }> = [
    {
      filename: item.filename,
      source: item.filenameSource ?? 'download-item',
    },
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
  /** Browser fallbacks whose Firefox onCreated echo must pass through. */
  private readonly browserFallbacks = new Map<string, number>();

  constructor(private readonly deps: OrchestratorDeps) {
    this.filterStages = createFilterPipeline(() => deps.getSiteRules());
  }

  /**
   * Handle a browser download exposed by the engine-specific event adapter.
   *
   * @returns true if the download was intercepted (cancelled in the browser).
   */
  async handleFirefoxCreatedDownload(item: DownloadItem): Promise<boolean> {
    // The Firefox onCreated fallback can replay interrupted or completed
    // downloads after restarts. Only genuinely new downloads are eligible.
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
      if (!(await this.cancelBrowserDownload(item.id))) return false;
      this.reportDuplicate(effectiveUrl, duplicate.shouldNotify, { tabUrl });
      return true;
    }

    const settings = this.deps.getSettings();
    if (settings.desktopUnavailable.action === 'browser') {
      if (!(await this.isDesktopReady())) {
        this.deps.duplicateGuard?.release(duplicate.reservation);
        this.log(
          'download_fallback',
          `Continuing in browser because Motrix Next is unavailable: ${effectiveUrl}`,
          { url: effectiveUrl, target: 'browser' },
        );
        return false;
      }
      if (!(await this.cancelBrowserDownload(item.id))) {
        this.deps.duplicateGuard?.release(duplicate.reservation);
        return false;
      }
    } else {
      if (!(await this.cancelBrowserDownload(item.id))) {
        this.deps.duplicateGuard?.release(duplicate.reservation);
        return false;
      }
      if (!(await this.ensureDesktopActivated(effectiveUrl, settings))) {
        this.deps.duplicateGuard?.release(duplicate.reservation);
        await this.restartBrowserDownload(item);
        return false;
      }
    }

    const job = await this.buildJob(item, tabUrl);
    const routed = await this.sendToDesktop(job, { allowActivation: false });
    if (!routed) {
      this.deps.duplicateGuard?.release(duplicate.reservation);
      this.log(
        'download_fallback',
        `Restarting in Firefox after desktop routing failed: ${job.displayName}`,
        { url: effectiveUrl, target: 'browser' },
        'warn',
      );
      await this.restartBrowserDownload(item);
      return false;
    }

    this.deps.duplicateGuard?.commit(duplicate.reservation);
    this.logIntercepted(item, tabUrl, filterResult.stageName);
    return true;
  }

  /**
   * Finish a Chromium download whose cancellation was issued synchronously by
   * the event adapter. Browser fallback starts a fresh, self-owned download so
   * Chrome can show exactly one save dialog under the user's global preference.
   */
  async handleChromiumTakeover(item: DownloadItem, cancellation: Promise<void>): Promise<boolean> {
    if (!(await this.finishChromiumCancellation(item.id, cancellation))) return false;

    const filterResult = this.evaluateCandidate(item);
    if (!filterResult) {
      await this.restartBrowserDownload(item);
      return false;
    }
    const { tabUrl } = filterResult;
    const effectiveUrl = item.finalUrl || item.url;

    const duplicate = this.reserveDuplicate(item);
    if (duplicate.blocked) {
      this.reportDuplicate(effectiveUrl, duplicate.shouldNotify, { tabUrl });
      return true;
    }

    const settings = this.deps.getSettings();
    if (settings.desktopUnavailable.action === 'browser') {
      if (!(await this.isDesktopReady())) {
        this.deps.duplicateGuard?.release(duplicate.reservation);
        this.log(
          'download_fallback',
          `Restarting in Chrome because Motrix Next is unavailable: ${effectiveUrl}`,
          { url: effectiveUrl, target: 'browser' },
        );
        await this.restartBrowserDownload(item);
        return false;
      }
    } else if (!(await this.ensureDesktopActivated(effectiveUrl, settings))) {
      this.deps.duplicateGuard?.release(duplicate.reservation);
      await this.restartBrowserDownload(item);
      return false;
    }

    const job = await this.buildJob(item, tabUrl);
    const routed = await this.sendToDesktop(job, { allowActivation: false });
    if (!routed) {
      this.deps.duplicateGuard?.release(duplicate.reservation);
      this.log(
        'download_fallback',
        `Restarting in Chrome after desktop routing failed: ${job.displayName}`,
        { url: effectiveUrl, target: 'browser' },
        'warn',
      );
      await this.restartBrowserDownload(item);
      return false;
    }

    this.deps.duplicateGuard?.commit(duplicate.reservation);
    this.logIntercepted(item, tabUrl, filterResult.stageName);
    return true;
  }

  shouldClaimChromiumDownload(item: DownloadItem): boolean {
    if (item.state !== 'in_progress') return false;
    return this.evaluateCandidate(item) !== null;
  }

  /**
   * Route a Firefox response that the blocking listener already cancelled.
   * Any failed desktop handoff recreates one Firefox-owned download.
   *
   * @returns true when the response remains owned by Motrix Next.
   */
  async handleFirefoxResponseTakeover(item: DownloadCandidate): Promise<boolean> {
    const filterResult = this.evaluateCandidate(item);
    if (!filterResult) {
      await this.restartBrowserDownload(item);
      return false;
    }
    const { tabUrl } = filterResult;
    const effectiveUrl = item.finalUrl || item.url;

    const settings = this.deps.getSettings();
    if (settings.desktopUnavailable.action === 'browser') {
      if (!(await this.isDesktopReady())) {
        this.log(
          'download_fallback',
          `Restarting in Firefox because Motrix Next is unavailable: ${effectiveUrl}`,
          { url: effectiveUrl, target: 'browser' },
        );
        await this.restartBrowserDownload(item);
        return false;
      }
    } else if (!(await this.ensureDesktopActivated(effectiveUrl, settings))) {
      await this.restartBrowserDownload(item);
      return false;
    }

    const duplicate = this.reserveDuplicate(item);
    if (duplicate.blocked) {
      this.reportDuplicate(effectiveUrl, duplicate.shouldNotify);
      return true;
    }

    const job = await this.buildJob(item, tabUrl);
    const routed = await this.sendToDesktop(job, { allowActivation: false });
    if (!routed) {
      this.deps.duplicateGuard?.release(duplicate.reservation);
      this.log(
        'download_fallback',
        `Restarting in Firefox after desktop routing failed: ${job.displayName}`,
        { url: effectiveUrl, target: 'browser' },
        'warn',
      );
      await this.restartBrowserDownload(item);
      return false;
    }

    this.deps.duplicateGuard?.commit(duplicate.reservation);
    this.logIntercepted(item, tabUrl, filterResult.stageName);
    return true;
  }

  shouldClaimFirefoxResponse(item: DownloadCandidate): boolean {
    return this.evaluateCandidate(item) !== null;
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
      { allowActivation: options.allowActivation ?? true },
    );
    if (!routed) {
      this.deps.duplicateGuard?.release(duplicate.reservation);
      throw new Error('Desktop app routing unavailable');
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

  private async isDesktopReady(): Promise<boolean> {
    return this.deps.desktopClient ? this.deps.desktopClient.isReady() : false;
  }

  /** Launch-mode activation: start the app and wait for its API. */
  private async ensureDesktopActivated(url: string, settings: DownloadSettings): Promise<boolean> {
    if (!this.deps.activateDesktop) return this.isDesktopReady();

    const timeoutMs = settings.desktopUnavailable.startupTimeoutSeconds * 1000;
    this.log('desktop_activation_attempt', `Activating desktop app for: ${url}`, {
      url,
      timeoutMs,
    });

    try {
      if (await this.deps.activateDesktop(timeoutMs)) {
        this.log('desktop_activation_success', `Desktop app activated successfully for: ${url}`, {
          url,
        });
        return true;
      }
      this.log(
        'desktop_activation_timeout',
        `Desktop activation timed out for: ${url}`,
        { url, timeoutMs },
        'warn',
      );
    } catch (e) {
      this.log(
        'download_fallback',
        `Motrix Next could not be activated: ${errorMessage(e)}`,
        { url, target: 'browser' },
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

  private async buildJob(item: DownloadCandidate, tabUrl: string): Promise<DownloadJob> {
    const effectiveUrl = item.finalUrl || item.url;
    const { filename, source } = resolveBestFilenameHint(effectiveUrl, item);
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
   * Try the HTTP API, then activate Motrix Next and retry over HTTP.
   */
  private async sendToDesktop(job: DownloadJob, options: SendOptions): Promise<boolean> {
    if (!this.deps.desktopClient) return false;

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
      if (!options.allowActivation) return false;
      this.log(
        'download_fallback',
        `HTTP API failed, attempting desktop activation: ${errorMessage(e)}`,
        { url: job.url },
        'warn',
      );
      return this.activateAndRetry(job);
    }
  }

  /** Activate the desktop app and retry the HTTP submission. */
  private async activateAndRetry(job: DownloadJob): Promise<boolean> {
    const settings = this.deps.getSettings();
    if (settings.desktopUnavailable.action !== 'launch' || !this.deps.activateDesktop) return false;

    this.log('desktop_activation_attempt', `Activating desktop app for: ${job.displayName}`, {
      url: job.url,
    });
    try {
      const activated = await this.deps.activateDesktop(
        settings.desktopUnavailable.startupTimeoutSeconds * 1000,
      );
      if (!activated) {
        this.log(
          'desktop_activation_timeout',
          `Desktop activation timed out for: ${job.displayName}`,
          { url: job.url },
          'warn',
        );
        return false;
      }
      this.log(
        'desktop_activation_success',
        `Desktop app activated successfully for: ${job.displayName}`,
        { url: job.url },
      );
      await this.submitToDesktopApi(job, true);
      return true;
    } catch (e) {
      if (e instanceof ApiAuthError) {
        this.log(
          'api_auth_failed',
          `HTTP API authentication failed after activation: ${e.message}`,
          { url: job.url },
          'error',
        );
        return false;
      }
      this.log(
        'download_fallback',
        `Desktop activation or retry failed: ${errorMessage(e)}`,
        { url: job.url },
        'warn',
      );
      return false;
    }
  }

  private async submitToDesktopApi(job: DownloadJob, afterActivation = false): Promise<void> {
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
      `Routed via HTTP API${afterActivation ? ' (after activation)' : ''}: ${job.displayName} (${response.action})`,
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

  /** Cancel and erase a browser download before ownership moves to the desktop app. */
  private async cancelBrowserDownload(id: number): Promise<boolean> {
    try {
      await this.deps.downloads.cancel(id);
    } catch (e) {
      this.log(
        'download_cancel_failed',
        `Cancel failed for download ${id}: ${errorMessage(e)}`,
        { downloadId: id },
        'warn',
      );
      return false;
    }
    await this.deps.downloads.erase({ id }).catch(() => {
      /* already removed from history — benign */
    });
    return true;
  }

  private async finishChromiumCancellation(
    id: number,
    cancellation: Promise<void>,
  ): Promise<boolean> {
    try {
      await cancellation;
    } catch (e) {
      this.log(
        'download_cancel_failed',
        `Cancel failed for download ${id}: ${errorMessage(e)}`,
        { downloadId: id },
        'warn',
      );
      return false;
    }
    await this.deps.downloads.erase({ id }).catch(() => {
      /* already removed from history */
    });
    return true;
  }

  private async restartBrowserDownload(item: DownloadCandidate): Promise<void> {
    const url = item.url;
    for (const candidate of new Set([item.url, item.finalUrl].filter(Boolean))) {
      this.browserFallbacks.set(candidate, Date.now() + BROWSER_FALLBACK_TTL_MS);
    }
    try {
      await this.deps.downloads.download({ url });
    } catch (e) {
      this.log(
        'download_failed',
        `Browser fallback failed: ${errorMessage(e)}`,
        { url, target: 'browser' },
        'error',
      );
    }
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
