/**
 * @fileoverview Tests for DesktopApiClient — the HTTP client that communicates
 * with the Motrix desktop app's embedded Axum API.
 *
 * TDD RED phase: these tests define the expected public API and behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DesktopApiClient,
  type DesktopApiConfig,
  type AddDownloadRequest,
  type AddDownloadResponse,
  type PingResponse,
} from '@/lib/api/desktop-client';

describe('DesktopApiClient', () => {
  const defaultConfig: DesktopApiConfig = {
    port: 16801,
    secret: 'test-secret',
  };

  let client: DesktopApiClient;

  beforeEach(() => {
    client = new DesktopApiClient(defaultConfig);
    vi.restoreAllMocks();
  });

  // ── Configuration ──────────────────────────────────────────

  it('constructs base URL from port', () => {
    expect(client.baseUrl).toBe('http://127.0.0.1:16801');
  });

  it('uses custom port in base URL', () => {
    const c = new DesktopApiClient({ port: 9999, secret: '' });
    expect(c.baseUrl).toBe('http://127.0.0.1:9999');
  });

  it('allows updating config at runtime', () => {
    client.updateConfig({ port: 12345, secret: 'new-secret' });
    expect(client.baseUrl).toBe('http://127.0.0.1:12345');
  });

  // ── ping() ─────────────────────────────────────────────────

  describe('ping', () => {
    it('returns PingResponse on success', async () => {
      const mockResponse: PingResponse = { status: 'ok', version: '3.7.3' };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await client.ping();
      expect(result).toEqual(mockResponse);
    });

    it('calls GET /ping with no auth header', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'ok', version: '1.0.0' }), { status: 200 }),
      );

      await client.ping();
      const [url, init] = vi.mocked(fetch).mock.calls[0]!;
      expect(url).toBe('http://127.0.0.1:16801/ping');
      // GET /ping uses bare fetch(url) — no init object at all
      expect(init).toBeUndefined();
    });

    it('throws on network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(client.ping()).rejects.toThrow('fetch failed');
    });

    it('throws on non-200 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Internal Server Error', { status: 500 }),
      );

      await expect(client.ping()).rejects.toThrow();
    });
  });

  // ── addDownload() ──────────────────────────────────────────

  describe('addDownload', () => {
    const request: AddDownloadRequest = {
      url: 'https://example.com/file.zip',
      referer: 'https://example.com/page',
      cookie: 'sid=abc',
      filename: 'file.zip',
    };

    it('returns AddDownloadResponse on success', async () => {
      const mockResponse: AddDownloadResponse = { action: 'submitted', gid: 'abc123' };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await client.addDownload(request);
      expect(result).toEqual(mockResponse);
    });

    it('sends POST /add with correct headers and body', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ action: 'queued' }), { status: 200 }),
      );

      await client.addDownload(request);
      const [url, init] = vi.mocked(fetch).mock.calls[0]!;
      expect(url).toBe('http://127.0.0.1:16801/add');
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
      expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer test-secret');
      expect(JSON.parse(init?.body as string)).toEqual(request);
    });

    it('omits Authorization header when secret is empty', async () => {
      const noAuthClient = new DesktopApiClient({ port: 16801, secret: '' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ action: 'queued' }), { status: 200 }),
      );

      await noAuthClient.addDownload(request);
      const [, init] = vi.mocked(fetch).mock.calls[0]!;
      expect((init?.headers as Record<string, string>)['Authorization']).toBeUndefined();
    });

    it('sends minimal request (url only)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ action: 'queued' }), { status: 200 }),
      );

      await client.addDownload({ url: 'https://example.com/file.zip' });
      const [, init] = vi.mocked(fetch).mock.calls[0]!;
      const body = JSON.parse(init?.body as string);
      expect(body.url).toBe('https://example.com/file.zip');
    });

    it('throws on 401 Unauthorized', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401 }),
      );

      await expect(client.addDownload(request)).rejects.toThrow(/401|Unauthorized/i);
    });

    it('throws on network failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(client.addDownload(request)).rejects.toThrow('Failed to fetch');
    });
  });

  // ── getStat() ───────────────────────────────────────────────

  describe('getStat', () => {
    it('returns GlobalStat data on success', async () => {
      const mockStat = {
        downloadSpeed: '1048576',
        uploadSpeed: '524288',
        numActive: '2',
        numWaiting: '3',
        numStopped: '5',
        numStoppedTotal: '10',
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockStat), { status: 200 }),
      );

      const result = await client.getStat();
      expect(result).toEqual(mockStat);
    });

    it('sends GET /stat with Bearer token', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            downloadSpeed: '0',
            uploadSpeed: '0',
            numActive: '0',
            numWaiting: '0',
            numStopped: '0',
            numStoppedTotal: '0',
          }),
          { status: 200 },
        ),
      );

      await client.getStat();
      const [url, init] = vi.mocked(fetch).mock.calls[0]!;
      expect(url).toBe('http://127.0.0.1:16801/stat');
      expect(init?.method).toBeUndefined(); // GET doesn't need explicit method
      expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer test-secret');
    });

    it('omits Authorization when secret is empty', async () => {
      const noAuthClient = new DesktopApiClient({ port: 16801, secret: '' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            downloadSpeed: '0',
            uploadSpeed: '0',
            numActive: '0',
            numWaiting: '0',
            numStopped: '0',
            numStoppedTotal: '0',
          }),
          { status: 200 },
        ),
      );

      await noAuthClient.getStat();
      const [, init] = vi.mocked(fetch).mock.calls[0]!;
      expect((init?.headers as Record<string, string>)?.['Authorization']).toBeUndefined();
    });

    it('throws on non-200 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Internal Server Error', { status: 500 }),
      );

      await expect(client.getStat()).rejects.toThrow();
    });

    it('throws on 401 Unauthorized', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401 }),
      );

      await expect(client.getStat()).rejects.toThrow(/401|Unauthorized/i);
    });
  });

  // ── pauseAll() ─────────────────────────────────────────────

  describe('pauseAll', () => {
    it('sends POST /pause-all with Bearer token', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'ok' }), { status: 200 }),
      );

      const result = await client.pauseAll();
      expect(result.status).toBe('ok');

      const [url, init] = vi.mocked(fetch).mock.calls[0]!;
      expect(url).toBe('http://127.0.0.1:16801/pause-all');
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer test-secret');
    });

    it('returns error response when engine is not running', async () => {
      const mockResponse = { status: 'error', error: 'Engine not running' };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await client.pauseAll();
      expect(result.status).toBe('error');
      expect(result.error).toBe('Engine not running');
    });

    it('throws on network failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(client.pauseAll()).rejects.toThrow('Failed to fetch');
    });
  });

  // ── resumeAll() ────────────────────────────────────────────

  describe('resumeAll', () => {
    it('sends POST /resume-all with Bearer token', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'ok' }), { status: 200 }),
      );

      const result = await client.resumeAll();
      expect(result.status).toBe('ok');

      const [url, init] = vi.mocked(fetch).mock.calls[0]!;
      expect(url).toBe('http://127.0.0.1:16801/resume-all');
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer test-secret');
    });

    it('returns error response when engine is not running', async () => {
      const mockResponse = { status: 'error', error: 'Engine not running' };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await client.resumeAll();
      expect(result.status).toBe('error');
      expect(result.error).toBe('Engine not running');
    });

    it('throws on network failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(client.resumeAll()).rejects.toThrow('Failed to fetch');
    });
  });
});
