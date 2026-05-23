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
import { API_CONNECTIVITY_TIMEOUT_MS, API_REQUEST_TIMEOUT_MS } from '@/shared/constants';

function firstRequest(): Request {
  const [input] = vi.mocked(fetch).mock.calls[0]!;
  expect(input).toBeInstanceOf(Request);
  return input as Request;
}

function captureFirstRequest(): Promise<Request> {
  return new Promise((resolve) => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce((input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      resolve(input as Request);
      return new Promise<Response>(() => {});
    });
  });
}

async function expectAbortAfter(request: Request, timeoutMs: number): Promise<void> {
  expect(request.signal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(timeoutMs - 1);
  expect(request.signal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(request.signal.aborted).toBe(true);
}

async function readJsonBody(request: Request): Promise<unknown> {
  return JSON.parse(await request.clone().text());
}

describe('DesktopApiClient', () => {
  const defaultConfig: DesktopApiConfig = {
    port: 16801,
    secret: 'test-secret',
  };

  let client: DesktopApiClient;

  beforeEach(() => {
    client = new DesktopApiClient(defaultConfig);
    vi.restoreAllMocks();
    vi.useRealTimers();
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
      const request = firstRequest();
      expect(request.url).toBe('http://127.0.0.1:16801/ping');
      expect(request.method).toBe('GET');
      expect(request.headers.get('authorization')).toBeNull();
    });

    it('throws on network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

      await expect(client.ping()).rejects.toThrow('Cannot connect to Motrix Next API');
    });

    it('throws on non-200 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Internal Server Error', { status: 500 }),
      );

      await expect(client.ping()).rejects.toThrow();
    });

    it('rejects malformed ping responses before returning them to callers', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'ok' }), { status: 200 }),
      );

      await expect(client.ping()).rejects.toThrow();
    });

    it('uses the short connectivity timeout', async () => {
      vi.useFakeTimers();
      try {
        const requestPromise = captureFirstRequest();

        void client.ping().catch(() => {});
        const request = await requestPromise;

        await expectAbortAfter(request, API_CONNECTIVITY_TIMEOUT_MS);
      } finally {
        vi.useRealTimers();
      }
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
      const sent = firstRequest();
      expect(sent.url).toBe('http://127.0.0.1:16801/add');
      expect(sent.method).toBe('POST');
      expect(sent.headers.get('content-type')).toBe('application/json');
      expect(sent.headers.get('authorization')).toBe('Bearer test-secret');
      await expect(readJsonBody(sent)).resolves.toEqual(request);
    });

    it('omits Authorization header when secret is empty', async () => {
      const noAuthClient = new DesktopApiClient({ port: 16801, secret: '' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ action: 'queued' }), { status: 200 }),
      );

      await noAuthClient.addDownload(request);
      expect(firstRequest().headers.get('authorization')).toBeNull();
    });

    it('sends minimal request (url only)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ action: 'queued' }), { status: 200 }),
      );

      await client.addDownload({ url: 'https://example.com/file.zip' });
      const body = (await readJsonBody(firstRequest())) as { url?: string };
      expect(body.url).toBe('https://example.com/file.zip');
    });

    it('throws on 401 Unauthorized', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401 }),
      );

      await expect(client.addDownload(request)).rejects.toThrow(/401|Unauthorized/i);
    });

    it('rejects malformed add-download responses before returning them to callers', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ gid: 'abc123' }), { status: 200 }),
      );

      await expect(client.addDownload(request)).rejects.toThrow();
    });

    it('throws on network failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(client.addDownload(request)).rejects.toThrow(
        'Cannot connect to Motrix Next API',
      );
    });

    it('keeps the longer request timeout for submitted downloads', async () => {
      vi.useFakeTimers();
      try {
        const requestPromise = captureFirstRequest();

        void client.addDownload(request).catch(() => {});
        const sent = await requestPromise;

        await expectAbortAfter(sent, API_REQUEST_TIMEOUT_MS);
      } finally {
        vi.useRealTimers();
      }
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
      const request = firstRequest();
      expect(request.url).toBe('http://127.0.0.1:16801/stat');
      expect(request.method).toBe('GET');
      expect(request.headers.get('authorization')).toBe('Bearer test-secret');
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
      expect(firstRequest().headers.get('authorization')).toBeNull();
    });

    it('throws on non-200 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
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

    it('rejects malformed stat responses before returning them to callers', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ downloadSpeed: '1' }), { status: 200 }),
      );

      await expect(client.getStat()).rejects.toThrow();
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

      const request = firstRequest();
      expect(request.url).toBe('http://127.0.0.1:16801/pause-all');
      expect(request.method).toBe('POST');
      expect(request.headers.get('authorization')).toBe('Bearer test-secret');
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
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(client.pauseAll()).rejects.toThrow('Cannot connect to Motrix Next API');
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

      const request = firstRequest();
      expect(request.url).toBe('http://127.0.0.1:16801/resume-all');
      expect(request.method).toBe('POST');
      expect(request.headers.get('authorization')).toBe('Bearer test-secret');
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
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(client.resumeAll()).rejects.toThrow('Cannot connect to Motrix Next API');
    });
  });
});
