import { describe, it, expect, vi } from 'vitest';
import {
  checkConnection,
  ApiAuthError,
  ApiTimeoutError,
  ApiUnreachableError,
  type PingResponse,
  type StatResponse,
} from '@/lib/api';

/** Helper: build a mock client with both ping and getStat. */
function mockClient(overrides: {
  ping?: () => Promise<PingResponse>;
  getStat?: () => Promise<StatResponse>;
}) {
  return {
    ping:
      overrides.ping ??
      vi.fn<() => Promise<PingResponse>>().mockResolvedValue({ status: 'ok', version: '3.7.3' }),
    getStat:
      overrides.getStat ??
      vi
        .fn<() => Promise<StatResponse>>()
        .mockResolvedValue({ downloadSpeed: '0' } as StatResponse),
  };
}

describe('checkConnection', () => {
  it('returns connected when both ping and getStat succeed', async () => {
    const result = await checkConnection(mockClient({}));

    expect(result.status).toBe('connected');
    expect(result.version).toBe('3.7.3');
    expect(result.error).toBeUndefined();
  });

  it('returns unreachable when ping fails', async () => {
    const result = await checkConnection(
      mockClient({ ping: vi.fn().mockRejectedValue(new ApiUnreachableError()) }),
    );

    expect(result.status).toBe('disconnected');
    expect(result.version).toBeNull();
    expect(result.error).toBe('ApiUnreachableError');
  });

  it('returns auth error with ping version when getStat rejects with 401', async () => {
    const result = await checkConnection(
      mockClient({ getStat: vi.fn().mockRejectedValue(new ApiAuthError()) }),
    );

    expect(result.status).toBe('disconnected');
    expect(result.version).toBe('3.7.3'); // version from ping survives auth failure
    expect(result.error).toBe('ApiAuthError');
  });

  it('returns timeout error', async () => {
    const result = await checkConnection(
      mockClient({ ping: vi.fn().mockRejectedValue(new ApiTimeoutError(5000)) }),
    );

    expect(result.status).toBe('disconnected');
    expect(result.error).toBe('ApiTimeoutError');
  });

  it('hides the version when getStat fails with a non-auth error', async () => {
    const result = await checkConnection(
      mockClient({ getStat: vi.fn().mockRejectedValue(new ApiUnreachableError()) }),
    );

    expect(result.status).toBe('disconnected');
    expect(result.version).toBeNull();
    expect(result.error).toBe('ApiUnreachableError');
  });

  it('handles non-Error thrown values', async () => {
    const result = await checkConnection(
      mockClient({ ping: vi.fn().mockRejectedValue('string error') }),
    );

    expect(result.status).toBe('disconnected');
    expect(result.error).toBe('UnknownError');
  });
});
