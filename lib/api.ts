/**
 * HTTP client for the Motrix Next desktop app's embedded REST API
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
import type { RequestHeader } from './download/request-context';

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
    super('Cannot connect to Motrix Next API', cause);
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

const AddDownloadResponseSchema = z.object({
  action: z.string(),
  gid: z.string().optional(),
  message: z.string().optional(),
});

export type PingResponse = z.output<typeof PingResponseSchema>;
export type StatResponse = z.output<typeof StatResponseSchema>;
type ActionResponse = z.output<typeof ActionResponseSchema>;
type AddDownloadResponse = z.output<typeof AddDownloadResponseSchema>;

interface AddDownloadRequest {
  url: string;
  finalUrl?: string;
  referer?: string;
  cookie?: string;
  filename?: string;
  userAgent?: string;
  requestHeaders?: RequestHeader[];
}

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
      timeout: API_REQUEST_TIMEOUT_MS,
      retry: { limit: API_MAX_RETRIES, methods: ['get', 'post'] },
    });
  }

  /** Bearer auth headers; empty when no secret is configured. */
  private authHeaders(): Record<string, string> {
    return this.config.secret ? { Authorization: `Bearer ${this.config.secret}` } : {};
  }

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    options: KyOptions,
    label: string,
  ): Promise<T> {
    try {
      const payload = await this.http(path, options).json<unknown>();
      return schema.parse(payload);
    } catch (error) {
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
    return this.request(
      'add',
      AddDownloadResponseSchema,
      { method: 'POST', headers: this.authHeaders(), json: request },
      'Add download',
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
