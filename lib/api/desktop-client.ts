/**
 * @fileoverview HTTP client for the Motrix Next desktop app's embedded REST API.
 *
 * Replaces the `motrixnext://` deep-link protocol for browser extension →
 * desktop communication. Communicates with the Axum HTTP server running
 * inside the Tauri process at `127.0.0.1:{port}`.
 *
 * Endpoints consumed:
 * - `GET  /ping`       — heartbeat / connectivity check
 * - `GET  /stat`       — global download/upload stats (auth required)
 * - `POST /add`        — submit a download for processing (auth required)
 * - `POST /pause-all`  — pause all active downloads (auth required)
 * - `POST /resume-all` — resume all paused downloads (auth required)
 */
import ky, { HTTPError, TimeoutError, type KyInstance, type Options as KyOptions } from 'ky';
import { z } from 'zod';
import {
  API_CONNECTIVITY_TIMEOUT_MS,
  API_MAX_RETRIES,
  API_REQUEST_TIMEOUT_MS,
} from '@/shared/constants';
import { ApiAuthError, ApiError, ApiTimeoutError, ApiUnreachableError } from '@/shared/errors';

z.config({ jitless: true });

// ── Types ────────────────────────────────────────────────────

export interface DesktopApiConfig {
  port: number;
  secret: string;
}

export interface PingResponse {
  status: string;
  version: string;
}

export interface StatResponse {
  downloadSpeed: string;
  uploadSpeed: string;
  numActive: string;
  numWaiting: string;
  numStopped: string;
  numStoppedTotal: string;
}

export interface ActionResponse {
  status: string;
  error?: string;
}

export interface AddDownloadRequest {
  url: string;
  referer?: string;
  cookie?: string;
  filename?: string;
}

export interface AddDownloadResponse {
  action: string;
  gid?: string;
  message?: string;
}

// ── Runtime Schemas ───────────────────────────────────────────

const PingResponseSchema = z
  .object({
    status: z.string(),
    version: z.string(),
  })
  .strict();

const StatResponseSchema = z
  .object({
    downloadSpeed: z.string(),
    uploadSpeed: z.string(),
    numActive: z.string(),
    numWaiting: z.string(),
    numStopped: z.string(),
    numStoppedTotal: z.string(),
  })
  .strict();

const ActionResponseSchema = z
  .object({
    status: z.string(),
    error: z.string().optional(),
  })
  .strict();

const AddDownloadResponseSchema = z
  .object({
    action: z.string(),
    gid: z.string().optional(),
    message: z.string().optional(),
  })
  .strict();

// ── Client ───────────────────────────────────────────────────

export class DesktopApiClient {
  private config: DesktopApiConfig;
  private http: KyInstance;

  constructor(config: DesktopApiConfig) {
    this.config = { ...config };
    this.http = this.createHttpClient();
  }

  /** Current base URL derived from the configured port. */
  get baseUrl(): string {
    return `http://127.0.0.1:${this.config.port}`;
  }

  /** Update config at runtime (e.g. when user changes port in settings). */
  updateConfig(config: DesktopApiConfig): void {
    this.config = { ...config };
    this.http = this.createHttpClient();
  }

  /**
   * Build auth headers for authenticated endpoints.
   * Returns an empty object when no secret is configured.
   */
  private authHeaders(): Record<string, string> {
    if (this.config.secret) {
      return { Authorization: `Bearer ${this.config.secret}` };
    }
    return {};
  }

  private createHttpClient(): KyInstance {
    return ky.create({
      prefix: this.baseUrl,
      timeout: API_REQUEST_TIMEOUT_MS,
      retry: {
        limit: API_MAX_RETRIES,
        methods: ['get', 'post'],
      },
    });
  }

  private async parseJson<T>(
    path: string,
    schema: z.ZodType<T>,
    options: KyOptions,
    label: string,
  ): Promise<T> {
    try {
      const payload = await this.http(path, options).json<unknown>();
      return schema.parse(payload);
    } catch (error) {
      throw await this.normalizeError(
        error,
        label,
        typeof options.timeout === 'number' ? options.timeout : API_REQUEST_TIMEOUT_MS,
      );
    }
  }

  private async normalizeError(error: unknown, label: string, timeoutMs: number): Promise<unknown> {
    if (error instanceof HTTPError) {
      const status = error.response.status;
      const detail = await this.readErrorDetail(error.response);
      if (status === 401) {
        return new ApiAuthError(error);
      }
      return new ApiError(`${label} failed: HTTP ${status}${detail}`, status, error);
    }

    if (error instanceof TimeoutError) {
      return new ApiTimeoutError(timeoutMs);
    }

    if (error instanceof Error && error.message.includes('network error')) {
      return new ApiUnreachableError(error);
    }

    if (error instanceof TypeError) {
      return new ApiUnreachableError(error);
    }

    return error;
  }

  private async readErrorDetail(response: Response): Promise<string> {
    try {
      const body = await response.text();
      return body ? ` — ${body.slice(0, 200)}` : '';
    } catch {
      return '';
    }
  }

  /**
   * Heartbeat check — no authentication required.
   * @throws on network error or non-200 response.
   */
  async ping(): Promise<PingResponse> {
    return this.parseJson(
      'ping',
      PingResponseSchema,
      {
        timeout: API_CONNECTIVITY_TIMEOUT_MS,
      },
      'Ping',
    );
  }

  /**
   * Fetch global download statistics.
   * Requires Bearer token authentication when a secret is configured.
   * @throws on network error, auth failure, or non-200 response.
   */
  async getStat(): Promise<StatResponse> {
    return this.parseJson(
      'stat',
      StatResponseSchema,
      {
        method: 'GET',
        headers: this.authHeaders(),
      },
      'Get stat',
    );
  }

  /**
   * Submit a download to the desktop app.
   * Requires Bearer token authentication when a secret is configured.
   * @throws on network error, auth failure, or non-200 response.
   */
  async addDownload(request: AddDownloadRequest): Promise<AddDownloadResponse> {
    return this.parseJson(
      'add',
      AddDownloadResponseSchema,
      {
        method: 'POST',
        headers: this.authHeaders(),
        json: request,
      },
      'Add download',
    );
  }

  /**
   * Pause all active downloads.
   * Requires Bearer token authentication when a secret is configured.
   * @throws on network error or non-200 response.
   */
  async pauseAll(): Promise<ActionResponse> {
    return this.parseJson(
      'pause-all',
      ActionResponseSchema,
      {
        method: 'POST',
        headers: this.authHeaders(),
      },
      'Pause all',
    );
  }

  /**
   * Resume all paused downloads.
   * Requires Bearer token authentication when a secret is configured.
   * @throws on network error or non-200 response.
   */
  async resumeAll(): Promise<ActionResponse> {
    return this.parseJson(
      'resume-all',
      ActionResponseSchema,
      {
        method: 'POST',
        headers: this.authHeaders(),
      },
      'Resume all',
    );
  }

  /**
   * Non-throwing reachability check.
   * @returns `true` if the desktop app is running and responsive.
   */
  async isReachable(): Promise<boolean> {
    try {
      await this.ping();
      return true;
    } catch {
      return false;
    }
  }
}
