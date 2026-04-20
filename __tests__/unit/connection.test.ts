import { describe, it, expect, vi } from 'vitest';
import { ConnectionService, ConnectionStatus } from '@/lib/services/connection';

describe('ConnectionService', () => {
  describe('checkConnection', () => {
    it('returns connected with app version when ping succeeds', async () => {
      const mockClient = {
        ping: vi.fn().mockResolvedValue({ status: 'ok', version: '3.7.3' }),
      };
      const service = new ConnectionService(mockClient);

      const result = await service.checkConnection();

      expect(result.status).toBe(ConnectionStatus.Connected);
      expect(result.version).toBe('3.7.3');
    });

    it('returns disconnected when ping fails', async () => {
      const mockClient = {
        ping: vi.fn().mockRejectedValue(new Error('fetch failed')),
      };
      const service = new ConnectionService(mockClient);

      const result = await service.checkConnection();

      expect(result.status).toBe(ConnectionStatus.Disconnected);
      expect(result.version).toBeNull();
      expect(result.error).toBe('Error');
    });

    it('returns disconnected with custom error name', async () => {
      const err = new Error('timeout');
      err.name = 'TimeoutError';
      const mockClient = {
        ping: vi.fn().mockRejectedValue(err),
      };
      const service = new ConnectionService(mockClient);

      const result = await service.checkConnection();

      expect(result.status).toBe(ConnectionStatus.Disconnected);
      expect(result.error).toBe('TimeoutError');
    });

    it('handles non-Error thrown values', async () => {
      const mockClient = {
        ping: vi.fn().mockRejectedValue('string error'),
      };
      const service = new ConnectionService(mockClient);

      const result = await service.checkConnection();

      expect(result.status).toBe(ConnectionStatus.Disconnected);
      expect(result.error).toBe('UnknownError');
    });
  });
});
