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

  it('returns auth error with ping version when getStat rejects with 401', async () => {
    const result = await checkConnection(
      mockClient({ getStat: vi.fn().mockRejectedValue(new ApiAuthError()) }),
    );

    expect(result.status).toBe('disconnected');
    expect(result.version).toBe('3.7.3'); // version from ping survives auth failure
    expect(result.error).toBe('ApiAuthError');
  });

  it('classifies non-authentication failures without exposing a stale version', async () => {
    for (const [error, name] of [
      [new ApiUnreachableError(), 'ApiUnreachableError'],
      [new ApiTimeoutError(5000), 'ApiTimeoutError'],
      ['string error', 'UnknownError'],
    ] as const) {
      const result = await checkConnection(mockClient({ ping: vi.fn().mockRejectedValue(error) }));
      expect(result).toMatchObject({ status: 'disconnected', version: null, error: name });
    }

    const statFailure = await checkConnection(
      mockClient({ getStat: vi.fn().mockRejectedValue(new ApiUnreachableError()) }),
    );
    expect(statFailure.version).toBeNull();
  });
});
