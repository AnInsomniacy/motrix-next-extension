import type {
  RpcConfig,
  RpcRequest,
  RpcResponse,
  Aria2Version,
  Aria2GlobalStat,
  Aria2Task,
  Aria2InputOptions,
} from '@/shared/types';
import { RpcError, RpcUnreachableError, RpcAuthError, RpcTimeoutError } from '@/shared/errors';

// ─── Types ──────────────────────────────────────────────

export interface Aria2ClientOptions {
  /** Custom fetch implementation for dependency injection in tests. */
  fetchFn?: typeof fetch;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
  /** Number of retry attempts for transient network errors. */
  maxRetries?: number;
}

// ─── Constants ──────────────────────────────────────────

const RPC_AUTH_ERROR_CODE = 7;

/** Motrix Next's aria2 fork returns code 1 with message "Unauthorized". */
function isAuthError(code: number, message: string): boolean {
  return code === RPC_AUTH_ERROR_CODE || message === 'Unauthorized';
}

// ─── Client ─────────────────────────────────────────────

/**
 * Aria2 JSON-RPC 2.0 client over HTTP.
 *
 * Design constraints:
 * - No WebSocket — MV3 service workers have short lifetimes
 * - Dependency injection for fetch — testable without network
 * - Typed responses for every supported method
 * - Retry only on transient errors (network), never on auth/logic errors
 */
export class Aria2Client {
  private config: RpcConfig;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private requestId = 0;

  constructor(config: RpcConfig, options?: Aria2ClientOptions) {
    this.config = { ...config };
    this.fetchFn = options?.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options?.timeoutMs ?? 5000;
    this.maxRetries = options?.maxRetries ?? 0;
  }

  /** Update RPC config at runtime (e.g. when user changes settings). */
  updateConfig(config: RpcConfig): void {
    this.config = { ...config };
  }

  // ─── Public API ───────────────────────────────────

  async getVersion(): Promise<Aria2Version> {
    return this.call<Aria2Version>('aria2.getVersion');
  }

  async addUri(uris: string[], options?: Aria2InputOptions): Promise<string> {
    const params: unknown[] = [uris];
    if (options) params.push(options);
    return this.call<string>('aria2.addUri', ...params);
  }

  /**
   * Add a BitTorrent download from a base64-encoded `.torrent` file.
   *
   * Unlike `addUri`, this submits the torrent content directly so aria2
   * parses the metadata and begins the BT download — equivalent to
   * dragging a `.torrent` file into the desktop app.
   *
   * @param base64 - Base64-encoded `.torrent` file content
   * @param options - Optional aria2 input options (dir, headers, etc.)
   * @returns The aria2 GID for the new download
   */
  async addTorrent(base64: string, options?: Aria2InputOptions): Promise<string> {
    const params: unknown[] = [base64, []]; // empty array = no web seeds
    if (options) params.push(options);
    return this.call<string>('aria2.addTorrent', ...params);
  }

  async tellActive(): Promise<Aria2Task[]> {
    return this.call<Aria2Task[]>('aria2.tellActive');
  }

  async getGlobalStat(): Promise<Aria2GlobalStat> {
    return this.call<Aria2GlobalStat>('aria2.getGlobalStat');
  }

  async pauseAll(): Promise<string> {
    return this.call<string>('aria2.pauseAll');
  }

  async unpauseAll(): Promise<string> {
    return this.call<string>('aria2.unpauseAll');
  }

  async tellStatus(gid: string): Promise<Aria2Task> {
    return this.call<Aria2Task>('aria2.tellStatus', gid);
  }

  // ─── Core RPC Call ────────────────────────────────

  private async call<T>(method: string, ...methodParams: unknown[]): Promise<T> {
    const id = String(++this.requestId);
    const params: unknown[] = [];

    if (this.config.secret) {
      params.push(`token:${this.config.secret}`);
    }
    params.push(...methodParams);

    const request: RpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return this.executeWithRetry<T>(request, 0);
  }

  private async executeWithRetry<T>(request: RpcRequest, attempt: number): Promise<T> {
    try {
      return await this.execute<T>(request);
    } catch (error) {
      // Never retry auth errors — they won't recover
      if (error instanceof RpcAuthError) {
        throw error;
      }

      // Never retry RPC logic errors (non-transient)
      if (
        error instanceof RpcError &&
        !(error instanceof RpcUnreachableError) &&
        !(error instanceof RpcTimeoutError)
      ) {
        throw error;
      }

      // Retry on transient errors (network, timeout)
      if (attempt < this.maxRetries) {
        return this.executeWithRetry<T>(request, attempt + 1);
      }

      throw error;
    }
  }

  private async execute<T>(request: RpcRequest): Promise<T> {
    const url = `http://${this.config.host}:${this.config.port}/jsonrpc`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new RpcTimeoutError(this.timeoutMs);
      }
      throw new RpcUnreachableError(error);
    } finally {
      clearTimeout(timer);
    }

    const data = (await response.json()) as RpcResponse<T>;

    if (data.error) {
      if (isAuthError(data.error.code, data.error.message)) {
        throw new RpcAuthError();
      }
      throw new RpcError(data.error.message, data.error.code);
    }

    return data.result as T;
  }
}
