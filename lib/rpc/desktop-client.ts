/**
 * @fileoverview HTTP client for the Motrix desktop app's embedded REST API.
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

// ── Client ───────────────────────────────────────────────────

export class DesktopApiClient {
  private config: DesktopApiConfig;

  constructor(config: DesktopApiConfig) {
    this.config = { ...config };
  }

  /** Current base URL derived from the configured port. */
  get baseUrl(): string {
    return `http://127.0.0.1:${this.config.port}`;
  }

  /** Update config at runtime (e.g. when user changes port in settings). */
  updateConfig(config: DesktopApiConfig): void {
    this.config = { ...config };
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

  /**
   * Heartbeat check — no authentication required.
   * @throws on network error or non-200 response.
   */
  async ping(): Promise<PingResponse> {
    const res = await fetch(`${this.baseUrl}/ping`);
    if (!res.ok) {
      throw new Error(`Ping failed: HTTP ${res.status}`);
    }
    return res.json() as Promise<PingResponse>;
  }

  /**
   * Fetch global download statistics.
   * Requires Bearer token authentication when a secret is configured.
   * @throws on network error, auth failure, or non-200 response.
   */
  async getStat(): Promise<StatResponse> {
    const res = await fetch(`${this.baseUrl}/stat`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Get stat failed: HTTP ${res.status}`);
    }
    return res.json() as Promise<StatResponse>;
  }

  /**
   * Submit a download to the desktop app.
   * Requires Bearer token authentication when a secret is configured.
   * @throws on network error, auth failure, or non-200 response.
   */
  async addDownload(request: AddDownloadRequest): Promise<AddDownloadResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.authHeaders(),
    };

    const res = await fetch(`${this.baseUrl}/add`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      throw new Error(`Add download failed: HTTP ${res.status}`);
    }
    return res.json() as Promise<AddDownloadResponse>;
  }

  /**
   * Pause all active downloads.
   * Requires Bearer token authentication when a secret is configured.
   * @throws on network error or non-200 response.
   */
  async pauseAll(): Promise<ActionResponse> {
    const res = await fetch(`${this.baseUrl}/pause-all`, {
      method: 'POST',
      headers: this.authHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Pause all failed: HTTP ${res.status}`);
    }
    return res.json() as Promise<ActionResponse>;
  }

  /**
   * Resume all paused downloads.
   * Requires Bearer token authentication when a secret is configured.
   * @throws on network error or non-200 response.
   */
  async resumeAll(): Promise<ActionResponse> {
    const res = await fetch(`${this.baseUrl}/resume-all`, {
      method: 'POST',
      headers: this.authHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Resume all failed: HTTP ${res.status}`);
    }
    return res.json() as Promise<ActionResponse>;
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
