import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_CONNECTIVITY_TIMEOUT_MS,
  API_REQUEST_TIMEOUT_MS,
  ApiAuthError,
  ApiUnreachableError,
  DesktopApiClient,
} from '@/lib/api';

const stat = {
  downloadSpeed: '0',
  uploadSpeed: '0',
  numActive: '0',
  numWaiting: '0',
  numStopped: '0',
  numStoppedTotal: '0',
};

function requestAt(index = 0): Request {
  const input = vi.mocked(fetch).mock.calls[index]?.[0];
  expect(input).toBeInstanceOf(Request);
  return input as Request;
}

async function jsonBody(request: Request): Promise<unknown> {
  return JSON.parse(await request.clone().text());
}

describe('DesktopApiClient', () => {
  let client: DesktopApiClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    client = new DesktopApiClient({ port: 29110, secret: 'secret' });
  });

  it('uses the configured port and keeps ping unauthenticated', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ status: 'ok', version: '1.0.0' })),
    );

    await client.ping();
    client.updateConfig({ port: 12345, secret: 'new-secret' });
    await client.ping();

    expect(requestAt(0).url).toBe('http://127.0.0.1:29110/ping');
    expect(requestAt(0).headers.get('authorization')).toBeNull();
    expect(requestAt(1).url).toBe('http://127.0.0.1:12345/ping');
  });

  it('submits the complete download contract with bearer authentication', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ action: 'queued', gid: 'gid' })),
    );
    const payload = {
      url: 'https://example.com/file.zip',
      finalUrl: 'https://cdn.example.com/file.zip',
      referer: 'https://example.com/page',
      cookie: 'sid=value',
      filename: 'file.zip',
      userAgent: 'Browser/1.0',
      requestHeaders: [{ name: 'Accept', value: 'application/octet-stream' }],
    };

    await expect(client.addDownload(payload)).resolves.toEqual({ action: 'queued', gid: 'gid' });
    expect(requestAt().url).toBe('http://127.0.0.1:29110/add');
    expect(requestAt().method).toBe('POST');
    expect(requestAt().headers.get('authorization')).toBe('Bearer secret');
    await expect(jsonBody(requestAt())).resolves.toEqual(payload);
  });

  it('uses the authenticated stat and task-control endpoints', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify((input as Request).url.endsWith('/stat') ? stat : { status: 'ok' }),
        ),
    );

    await client.getStat();
    await client.pauseAll();
    await client.resumeAll();

    expect(vi.mocked(fetch).mock.calls.map((_, index) => requestAt(index).url)).toEqual([
      'http://127.0.0.1:29110/stat',
      'http://127.0.0.1:29110/pause-all',
      'http://127.0.0.1:29110/resume-all',
    ]);
    expect(requestAt(1).method).toBe('POST');
  });

  it('rejects malformed desktop responses at the API boundary', async () => {
    for (const [call, payload] of [
      [() => client.ping(), { status: 'ok' }],
      [() => client.getStat(), { downloadSpeed: '0' }],
      [() => client.addDownload({ url: 'https://example.com' }), { gid: 'missing-action' }],
    ] as const) {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(payload)));
      await expect(call()).rejects.toThrow();
      vi.restoreAllMocks();
    }
  });

  it('classifies transport failures and preserves parsed HTTP error details', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    );
    await expect(client.getStat()).rejects.toBeInstanceOf(ApiAuthError);

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(client.ping()).rejects.toBeInstanceOf(ApiUnreachableError);

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Download rejected', { status: 409 }),
    );
    await expect(client.addDownload({ url: 'https://example.com/file.zip' })).rejects.toThrow(
      'HTTP 409 — Download rejected',
    );
  });

  it('uses short readiness timeouts and longer work-request timeouts', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      signals.push((input as Request).signal);
      return new Promise<Response>(() => {});
    });

    void client.ping().catch(() => {});
    await vi.advanceTimersByTimeAsync(API_CONNECTIVITY_TIMEOUT_MS);
    expect(signals[0]?.aborted).toBe(true);

    void client.addDownload({ url: 'https://example.com' }).catch(() => {});
    await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS);
    expect(signals[1]?.aborted).toBe(true);
  });

  it('reports readiness without throwing', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(stat)))
      .mockResolvedValueOnce(new Response('Unavailable', { status: 503 }));

    await expect(client.isReady()).resolves.toBe(true);
    await expect(client.isReady()).resolves.toBe(false);
  });
});
