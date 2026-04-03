import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Aria2Client } from '@/modules/rpc/aria2-client';
import type { RpcConfig, Aria2Version, Aria2GlobalStat, Aria2Task } from '@/shared/types';
import { RpcUnreachableError, RpcAuthError, RpcTimeoutError } from '@/shared/errors';

// ─── Test Fixtures ──────────────────────────────────────

const DEFAULT_CONFIG: RpcConfig = {
  host: '127.0.0.1',
  port: 16800,
  secret: 'test-secret',
};

function createSuccessResponse<T>(id: string, result: T): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createErrorResponse(id: string, code: number, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Tests ──────────────────────────────────────────────

describe('Aria2Client', () => {
  let client: Aria2Client;
  let fetchSpy: ReturnType<
    typeof vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>
  >;

  beforeEach(() => {
    fetchSpy = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
    client = new Aria2Client(DEFAULT_CONFIG, { fetchFn: fetchSpy, timeoutMs: 5000 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Request Construction ───────────────────────────

  describe('request construction', () => {
    it('sends JSON-RPC 2.0 request to the correct endpoint', async () => {
      const versionResult: Aria2Version = { version: '1.37.0', enabledFeatures: ['BitTorrent'] };
      fetchSpy.mockResolvedValueOnce(createSuccessResponse('1', versionResult));

      await client.getVersion();

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://127.0.0.1:16800/jsonrpc');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    });

    it('injects secret token as first param in every call', async () => {
      fetchSpy.mockResolvedValueOnce(
        createSuccessResponse('1', { version: '1.37.0', enabledFeatures: [] }),
      );

      await client.getVersion();

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as { params: unknown[] };
      expect(body.params[0]).toBe('token:test-secret');
    });

    it('omits token when secret is empty', async () => {
      const noSecretClient = new Aria2Client(
        { ...DEFAULT_CONFIG, secret: '' },
        { fetchFn: fetchSpy, timeoutMs: 5000 },
      );
      fetchSpy.mockResolvedValueOnce(
        createSuccessResponse('1', { version: '1.37.0', enabledFeatures: [] }),
      );

      await noSecretClient.getVersion();

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as { params: unknown[] };
      expect(body.params).toHaveLength(0);
    });

    it('includes method-specific params after the token', async () => {
      fetchSpy.mockResolvedValueOnce(createSuccessResponse('1', 'fake-gid'));

      await client.addUri(['https://example.com/file.zip'], { dir: '/downloads' });

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as { method: string; params: unknown[] };
      expect(body.method).toBe('aria2.addUri');
      expect(body.params[0]).toBe('token:test-secret');
      expect(body.params[1]).toEqual(['https://example.com/file.zip']);
      expect(body.params[2]).toEqual({ dir: '/downloads' });
    });
  });

  // ─── Successful Responses ───────────────────────────

  describe('successful responses', () => {
    it('getVersion returns parsed version info', async () => {
      const expected: Aria2Version = { version: '1.37.0', enabledFeatures: ['BitTorrent', 'GZip'] };
      fetchSpy.mockResolvedValueOnce(createSuccessResponse('1', expected));

      const result = await client.getVersion();

      expect(result).toEqual(expected);
    });

    it('addUri returns GID string', async () => {
      fetchSpy.mockResolvedValueOnce(createSuccessResponse('1', '2089b05ecca3d829'));

      const gid = await client.addUri(['https://example.com/file.zip']);

      expect(gid).toBe('2089b05ecca3d829');
    });

    it('tellActive returns task array', async () => {
      const tasks: Aria2Task[] = [
        {
          gid: 'abc123',
          status: 'active',
          totalLength: '1048576',
          completedLength: '524288',
          uploadLength: '0',
          downloadSpeed: '102400',
          uploadSpeed: '0',
          dir: '/downloads',
          files: [],
        },
      ];
      fetchSpy.mockResolvedValueOnce(createSuccessResponse('1', tasks));

      const result = await client.tellActive();

      expect(result).toHaveLength(1);
      expect(result[0]?.gid).toBe('abc123');
      expect(result[0]?.status).toBe('active');
    });

    it('getGlobalStat returns stat object', async () => {
      const stat: Aria2GlobalStat = {
        downloadSpeed: '102400',
        uploadSpeed: '0',
        numActive: '1',
        numWaiting: '0',
        numStopped: '5',
        numStoppedTotal: '10',
      };
      fetchSpy.mockResolvedValueOnce(createSuccessResponse('1', stat));

      const result = await client.getGlobalStat();

      expect(result.downloadSpeed).toBe('102400');
      expect(result.numActive).toBe('1');
    });

    it('pauseAll returns OK', async () => {
      fetchSpy.mockResolvedValueOnce(createSuccessResponse('1', 'OK'));

      const result = await client.pauseAll();

      expect(result).toBe('OK');
    });

    it('unpauseAll returns OK', async () => {
      fetchSpy.mockResolvedValueOnce(createSuccessResponse('1', 'OK'));

      const result = await client.unpauseAll();

      expect(result).toBe('OK');
    });
  });

  // ─── Error Handling ─────────────────────────────────

  describe('error handling', () => {
    it('throws RpcUnreachableError on network failure', async () => {
      fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(client.getVersion()).rejects.toThrow(RpcUnreachableError);
    });

    it('throws RpcAuthError when server returns unauthorized error', async () => {
      fetchSpy.mockResolvedValueOnce(createErrorResponse('1', 7, 'Unauthorized'));

      await expect(client.getVersion()).rejects.toThrow(RpcAuthError);
    });

    it('throws RpcTimeoutError when request exceeds timeout', async () => {
      const slowClient = new Aria2Client(DEFAULT_CONFIG, {
        fetchFn: fetchSpy,
        timeoutMs: 50,
      });
      fetchSpy.mockImplementationOnce(
        (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            if (signal) {
              const onAbort = () => {
                reject(new DOMException('The operation was aborted.', 'AbortError'));
              };
              if (signal.aborted) {
                onAbort();
                return;
              }
              signal.addEventListener('abort', onAbort);
            }
          }),
      );

      await expect(slowClient.getVersion()).rejects.toThrow(RpcTimeoutError);
    });

    it('throws RpcError with server error code and message', async () => {
      fetchSpy.mockResolvedValueOnce(createErrorResponse('1', 1, 'GID abc not found'));

      await expect(client.addUri(['https://example.com/file.zip'])).rejects.toThrow(
        'GID abc not found',
      );
    });
  });

  // ─── Retry Behavior ─────────────────────────────────

  describe('retry behavior', () => {
    it('retries once on transient network failure', async () => {
      const retryClient = new Aria2Client(DEFAULT_CONFIG, {
        fetchFn: fetchSpy,
        timeoutMs: 5000,
        maxRetries: 1,
      });
      fetchSpy
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(
          createSuccessResponse('1', { version: '1.37.0', enabledFeatures: [] }),
        );

      const result = await retryClient.getVersion();

      expect(result.version).toBe('1.37.0');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('does not retry on auth errors', async () => {
      const retryClient = new Aria2Client(DEFAULT_CONFIG, {
        fetchFn: fetchSpy,
        timeoutMs: 5000,
        maxRetries: 1,
      });
      fetchSpy.mockResolvedValueOnce(createErrorResponse('1', 7, 'Unauthorized'));

      await expect(retryClient.getVersion()).rejects.toThrow(RpcAuthError);
      expect(fetchSpy).toHaveBeenCalledOnce();
    });

    it('throws after exhausting all retries', async () => {
      const retryClient = new Aria2Client(DEFAULT_CONFIG, {
        fetchFn: fetchSpy,
        timeoutMs: 5000,
        maxRetries: 2,
      });
      fetchSpy
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(retryClient.getVersion()).rejects.toThrow(RpcUnreachableError);
      expect(fetchSpy).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });
  });

  // ─── Config Update ──────────────────────────────────

  describe('config update', () => {
    it('uses new config after updateConfig', async () => {
      fetchSpy.mockResolvedValueOnce(
        createSuccessResponse('1', { version: '1.37.0', enabledFeatures: [] }),
      );

      client.updateConfig({ host: '192.168.1.100', port: 6800, secret: 'new-secret' });
      await client.getVersion();

      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://192.168.1.100:6800/jsonrpc');
      const body = JSON.parse(options.body as string) as { params: unknown[] };
      expect(body.params[0]).toBe('token:new-secret');
    });
  });
});
