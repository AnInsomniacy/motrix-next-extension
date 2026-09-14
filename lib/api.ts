/**
 * HTTP client for the Rayburst desktop app's embedded REST API
 * (Axum server at `127.0.0.1:{port}`), plus the extension's single error
 * taxonomy and the two-step connection check.
 *
 * Endpoints: GET /ping (no auth), GET /stat, POST /add, POST /pause-all,
 * POST /resume-all (Bearer auth when a secret is configured).
 */
import ky, {
  HTTPError,
  NetworkError,
  TimeoutError,
  type KyInstance,
  type Options as KyOptions,
} from 'ky';
import { z } from 'zod';
import type { ConnectionConfig } from './schema';
import {
  AddDownloadResponseSchema,
  type AddDownloadRequest,
  type AddDownloadResponse,
} from './download/contracts';
import { rememberDownload, forgetDownload, pendingDownloads } from './download/pending';
import {
  MEDIA_API_PATH,
  MediaCapabilitiesSchema,
  MediaProbeRequestSchema,
  MediaProbeSchema,
  MediaSubmitRequestSchema,
  MediaSubmitResponseSchema,
  MediaCancelResponseSchema,
  MediaErrorResponseSchema,
  type MediaProbeRequest,
  type MediaSubmitRequest,
} from './media/contracts';

z.config({ jitless: true });

// ─── Timing ─────────────────────────────────────────────

/** Short timeout for local reachability checks. */
export const API_CONNECTIVITY_TIMEOUT_MS = 500;
/** Timeout for API requests that perform real work. */
export const API_REQUEST_TIMEOUT_MS = 5000;
/** Retry attempts for failed API calls. */
const API_MAX_RETRIES = 1;

// ─── Errors ─────────────────────────────────────────────

/** API communication error. Subclasses classify the failure mode. */
class ApiError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ApiUnreachableError extends ApiError {
  constructor(cause?: unknown) {
    super('Cannot connect to Rayburst API', cause);
    this.name = 'ApiUnreachableError';
  }
}

export class ApiAuthError extends ApiError {
  constructor(cause?: unknown) {
    super('HTTP 401 Unauthorized: API secret is incorrect', cause);
    this.name = 'ApiAuthError';
  }
}

export class ApiTimeoutError extends ApiError {
  constructor(timeoutMs: number) {
    super(`API call timed out after ${timeoutMs}ms`);
    this.name = 'ApiTimeoutError';
  }
}

export class ApiDeliveryUncertainError extends ApiError {
  constructor(cause: unknown) {
    super('The desktop may have accepted this download; its receipt is pending', cause);
    this.name = 'ApiDeliveryUncertainError';
  }
}

export class MediaApiError extends ApiError {
  constructor(public readonly code: string) {
    super('Media request failed');
    this.name = 'MediaApiError';
  }
}

// ─── Response Schemas ───────────────────────────────────
// Validate the fields consumed by the extension at the HTTP boundary.

const PingResponseSchema = z.object({ status: z.string(), version: z.string() });

const StatResponseSchema = z.object({
  downloadSpeed: z.string(),
  uploadSpeed: z.string(),
  numActive: z.string(),
  numWaiting: z.string(),
  numStopped: z.string(),
  numStoppedTotal: z.string(),
});

const ActionResponseSchema = z.object({ status: z.string(), error: z.string().optional() });

export type PingResponse = z.output<typeof PingResponseSchema>;
export type StatResponse = z.output<typeof StatResponseSchema>;
type ActionResponse = z.output<typeof ActionResponseSchema>;

type ConnectionSnapshot = {
  config: ConnectionConfig;
  http: KyInstance;
  authHeaders: Record<string, string>;
};

// ─── Client ─────────────────────────────────────────────

export class DesktopApiClient {
  private config: ConnectionConfig;
  private http: KyInstance;

  constructor(config: ConnectionConfig) {
    this.config = { ...config };
    this.http = this.createHttpClient();
  }

  /** Update config at runtime (e.g. when the user changes the port). */
  updateConfig(config: ConnectionConfig): void {
    this.config = { ...config };
    this.http = this.createHttpClient();
  }

  private createHttpClient(): KyInstance {
    return ky.create({
      prefix: `http://127.0.0.1:${this.config.port}`,
      credentials: 'omit',
      cache: 'no-store',
      timeout: API_REQUEST_TIMEOUT_MS,
      retry: { limit: API_MAX_RETRIES, methods: ['get'] },
    });
  }

  /** Bearer auth headers; empty when no secret is configured. */
  private authHeaders(config: ConnectionConfig = this.config): Record<string, string> {
    return config.secret ? { Authorization: `Bearer ${config.secret}` } : {};
  }

  private captureConnection(): ConnectionSnapshot {
    const config = { ...this.config };
    return { config, http: this.http, authHeaders: this.authHeaders(config) };
  }

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    options: KyOptions,
    label: string,
    http: KyInstance = this.http,
  ): Promise<T> {
    try {
      const payload = await http(path, options).json<unknown>();
      return schema.parse(payload);
    } catch (error) {
      if (path.startsWith(MEDIA_API_PATH)) {
        if (error instanceof z.ZodError) throw new MediaApiError('invalid_response');
        if (error instanceof HTTPError && error.response.status !== 401) {
          const parsed = MediaErrorResponseSchema.safeParse(error.data);
          const code = parsed.success
            ? parsed.data.error
            : [404, 405].includes(error.response.status)
              ? 'integration_unavailable'
              : error.response.status === 410
                ? 'expired'
                : 'desktop_error';
          throw new MediaApiError(code);
        }
      }
      throw normalizeApiError(
        error,
        label,
        typeof options.timeout === 'number' ? options.timeout : API_REQUEST_TIMEOUT_MS,
      );
    }
  }

  /** Heartbeat check — no authentication required. */
  async ping(): Promise<PingResponse> {
    return this.request(
      'ping',
      PingResponseSchema,
      { timeout: API_CONNECTIVITY_TIMEOUT_MS, retry: 0 },
      'Ping',
    );
  }

  async getStat(): Promise<StatResponse> {
    return this.request(
      'stat',
      StatResponseSchema,
      { method: 'GET', headers: this.authHeaders() },
      'Get stat',
    );
  }

  async addDownload(request: AddDownloadRequest): Promise<AddDownloadResponse> {
    return this.addDownloadWithSnapshot(request, this.captureConnection());
  }

  private async addDownloadWithSnapshot(
    request: AddDownloadRequest,
    connection: ConnectionSnapshot,
  ): Promise<AddDownloadResponse> {
    await this.request(
      'downloads/capabilities',
      z.object({ protocolVersion: z.literal(2), filenameHints: z.literal(true) }),
      { method: 'GET', headers: connection.authHeaders, retry: 0 },
      'Check download support',
      connection.http,
    );
    await rememberDownload(request, connection.config);
    try {
      const response = await this.request(
        'add',
        AddDownloadResponseSchema,
        { method: 'POST', headers: connection.authHeaders, json: request, retry: 0 },
        'Add download',
        connection.http,
      );
      if (response.id !== request.id || (response.action === 'submitted' && !response.gid))
        throw new Error('Download receipt does not match its request');
      await forgetDownload(request.id);
      return response;
    } catch (error) {
      if (error instanceof ApiAuthError) {
        await forgetDownload(request.id);
        throw error;
      }
      throw new ApiDeliveryUncertainError(error);
    }
  }

  async reconcileDownloads(): Promise<number> {
    const connection = this.captureConnection();
    const pending = await pendingDownloads(connection.config);
    const results = await Promise.allSettled(
      pending.map((request) => this.addDownloadWithSnapshot(request, connection)),
    );
    return results.filter((result) => result.status === 'rejected').length;
  }

  async mediaCapabilities() {
    return this.request(
      `${MEDIA_API_PATH}/capabilities`,
      MediaCapabilitiesSchema,
      { headers: this.authHeaders(), retry: 0 },
      'Media capabilities',
    );
  }

  async createMediaProbe(request: MediaProbeRequest) {
    return this.request(
      `${MEDIA_API_PATH}/probes`,
      MediaProbeSchema,
      {
        method: 'POST',
        headers: this.authHeaders(),
        json: MediaProbeRequestSchema.parse(request),
        retry: 0,
      },
      'Probe media',
    );
  }

  async getMediaProbe(id: string) {
    return this.request(
      `${MEDIA_API_PATH}/probes/${encodeURIComponent(id)}`,
      MediaProbeSchema,
      { headers: this.authHeaders(), retry: 0 },
      'Read media probe',
    );
  }

  async submitMediaProbe(id: string, request: MediaSubmitRequest) {
    return this.request(
      `${MEDIA_API_PATH}/probes/${encodeURIComponent(id)}/submit`,
      MediaSubmitResponseSchema,
      {
        method: 'POST',
        headers: this.authHeaders(),
        json: MediaSubmitRequestSchema.parse(request),
        retry: 0,
      },
      'Submit media',
    );
  }

  async cancelMediaProbe(id: string) {
    return this.request(
      `${MEDIA_API_PATH}/probes/${encodeURIComponent(id)}/cancel`,
      MediaCancelResponseSchema,
      { method: 'POST', headers: this.authHeaders(), json: {}, retry: 0 },
      'Cancel media probe',
    );
  }

  async pauseAll(): Promise<ActionResponse> {
    return this.request(
      'pause-all',
      ActionResponseSchema,
      { method: 'POST', headers: this.authHeaders() },
      'Pause all',
    );
  }

  async resumeAll(): Promise<ActionResponse> {
    return this.request(
      'resume-all',
      ActionResponseSchema,
      { method: 'POST', headers: this.authHeaders() },
      'Resume all',
    );
  }

  /** Non-throwing readiness check for both the desktop app and its engine. */
  async isReady(): Promise<boolean> {
    try {
      await this.request(
        'stat',
        StatResponseSchema,
        {
          method: 'GET',
          headers: this.authHeaders(),
          timeout: API_CONNECTIVITY_TIMEOUT_MS,
          retry: 0,
        },
        'Check readiness',
      );
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Classify a transport-level failure into the extension's error taxonomy.
 * This is the ONLY place errors are classified — downstream code uses
 * `instanceof` exclusively.
 */
function normalizeApiError(error: unknown, label: string, timeoutMs: number): unknown {
  if (error instanceof HTTPError) {
    if (error.response.status === 401) return new ApiAuthError(error);
    const detail =
      typeof error.data === 'string' && error.data ? ` — ${error.data.slice(0, 200)}` : '';
    return new ApiError(`${label} failed: HTTP ${error.response.status}${detail}`, error);
  }
  if (error instanceof TimeoutError) return new ApiTimeoutError(timeoutMs);
  if (error instanceof NetworkError) return new ApiUnreachableError(error);
  return error;
}

// ─── Connection Check ───────────────────────────────────

export type ConnectionStatus = 'connected' | 'disconnected';

type ConnectionResult =
  | { status: 'connected'; version: string; stat: StatResponse }
  | { status: 'disconnected'; version: string | null; error: string };

/**
 * Two-step connection verification:
 *   1. `ping()` — the app is running (no auth)
 *   2. `getStat()` — the API secret is correct (Bearer auth)
 */
export async function checkConnection(
  client: Pick<DesktopApiClient, 'ping' | 'getStat'>,
): Promise<ConnectionResult> {
  let version: string | null = null;
  try {
    version = (await client.ping()).version;
    const stat = await client.getStat();
    return { status: 'connected', version, stat };
  } catch (error) {
    return {
      status: 'disconnected',
      version: error instanceof ApiAuthError ? version : null,
      error: error instanceof Error ? error.name : 'UnknownError',
    };
  }
}
