import type { PingResponse, StatResponse } from '@/lib/api/desktop-client';

export enum ConnectionStatus {
  Connected = 'connected',
  Disconnected = 'disconnected',
}

export interface ConnectionResult {
  status: ConnectionStatus;
  version: string | null;
  error?: string;
}

/**
 * Client interface for connection checks — matches DesktopApiClient.
 *
 * Requires both `ping` (reachability) and `getStat` (auth verification).
 * The `/ping` endpoint has no auth, so a successful ping only proves
 * the desktop app is running. `getStat` requires a valid Bearer token,
 * verifying the API secret is correct.
 */
interface ApiClient {
  ping: () => Promise<PingResponse>;
  getStat: () => Promise<StatResponse>;
}

// ── Typed Error Classes ──────────────────────────────────

class ApiUnreachableError extends Error {
  override name = 'ApiUnreachableError';
}

class ApiAuthError extends Error {
  override name = 'ApiAuthError';
}

class ApiTimeoutError extends Error {
  override name = 'ApiTimeoutError';
}

/**
 * Checks connectivity to the Motrix Next desktop app via the HTTP API.
 *
 * Two-step verification:
 *   1. `ping()` — confirms the app is running (no auth required)
 *   2. `getStat()` — confirms the API secret is correct (Bearer token)
 *
 * If step 1 fails → unreachable. If step 2 returns 401 → auth error.
 * Only when both succeed is the connection considered established.
 *
 * Stateless — call checkConnection() on demand.
 */
export class ConnectionService {
  private readonly client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  async checkConnection(): Promise<ConnectionResult> {
    try {
      // Step 1: Reachability check (no auth)
      const ping = await this.client.ping();

      // Step 2: Auth verification (requires valid Bearer token)
      try {
        await this.client.getStat();
      } catch (authError) {
        // Distinguish 401 auth failures from other errors
        if (authError instanceof Error && authError.message.includes('401')) {
          return {
            status: ConnectionStatus.Disconnected,
            version: ping.version,
            error: 'ApiAuthError',
          };
        }
        // Non-401 errors during getStat are still auth-related failures
        throw authError;
      }

      return {
        status: ConnectionStatus.Connected,
        version: ping.version,
      };
    } catch (error) {
      const errorType = this.classifyError(error);
      return {
        status: ConnectionStatus.Disconnected,
        version: null,
        error: errorType,
      };
    }
  }

  /** Classify fetch errors into typed error names for i18n mapping. */
  private classifyError(error: unknown): string {
    if (error instanceof Error) {
      // Already classified
      if (
        error instanceof ApiUnreachableError ||
        error instanceof ApiAuthError ||
        error instanceof ApiTimeoutError
      ) {
        return error.name;
      }

      // Network errors (ERR_CONNECTION_REFUSED, etc.)
      if (error.name === 'TypeError' || error.message.includes('Failed to fetch')) {
        return 'ApiUnreachableError';
      }

      // Timeout
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        return 'ApiTimeoutError';
      }

      // Auth (HTTP 401)
      if (error.message.includes('401')) {
        return 'ApiAuthError';
      }
    }

    return 'UnknownError';
  }
}
