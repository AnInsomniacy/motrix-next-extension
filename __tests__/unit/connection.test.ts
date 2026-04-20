import { describe, it, expect, vi } from 'vitest';
import { ConnectionService, ConnectionStatus } from '@/lib/services/connection';

/** Helper: build a mock client with both ping and getStat. */
function mockClient(overrides: {
  ping?: ReturnType<typeof vi.fn>;
  getStat?: ReturnType<typeof vi.fn>;
}) {
  return {
    ping: overrides.ping ?? vi.fn().mockResolvedValue({ status: 'ok', version: '3.7.3' }),
    getStat: overrides.getStat ?? vi.fn().mockResolvedValue({ downloadSpeed: '0' }),
  };
}

describe('ConnectionService', () => {
  describe('checkConnection', () => {
    it('returns connected when both ping and getStat succeed', async () => {
      const client = mockClient({});
      const service = new ConnectionService(client);

      const result = await service.checkConnection();

      expect(result.status).toBe(ConnectionStatus.Connected);
      expect(result.version).toBe('3.7.3');
      expect(result.error).toBeUndefined();
    });

    it('returns disconnected when ping fails (unreachable)', async () => {
      const err = new TypeError('Failed to fetch');
      const client = mockClient({ ping: vi.fn().mockRejectedValue(err) });
      const service = new ConnectionService(client);

      const result = await service.checkConnection();

      expect(result.status).toBe(ConnectionStatus.Disconnected);
      expect(result.version).toBeNull();
      expect(result.error).toBe('RpcUnreachableError');
    });

    it('returns auth error when ping succeeds but getStat returns 401', async () => {
      const client = mockClient({
        getStat: vi.fn().mockRejectedValue(new Error('Get stat failed: HTTP 401')),
      });
      const service = new ConnectionService(client);

      const result = await service.checkConnection();

      expect(result.status).toBe(ConnectionStatus.Disconnected);
      expect(result.version).toBe('3.7.3'); // version from ping
      expect(result.error).toBe('RpcAuthError');
    });

    it('returns timeout error on AbortError', async () => {
      const err = new Error('timeout');
      err.name = 'AbortError';
      const client = mockClient({ ping: vi.fn().mockRejectedValue(err) });
      const service = new ConnectionService(client);

      const result = await service.checkConnection();

      expect(result.status).toBe(ConnectionStatus.Disconnected);
      expect(result.error).toBe('RpcTimeoutError');
    });

    it('handles non-Error thrown values', async () => {
      const client = mockClient({ ping: vi.fn().mockRejectedValue('string error') });
      const service = new ConnectionService(client);

      const result = await service.checkConnection();

      expect(result.status).toBe(ConnectionStatus.Disconnected);
      expect(result.error).toBe('UnknownError');
    });

    it('returns unreachable when getStat fails with network error', async () => {
      const client = mockClient({
        getStat: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
      });
      const service = new ConnectionService(client);

      const result = await service.checkConnection();

      expect(result.status).toBe(ConnectionStatus.Disconnected);
      expect(result.version).toBeNull();
      expect(result.error).toBe('RpcUnreachableError');
    });
  });
});
