import { describe, it, expect, vi } from 'vitest';
import { ConnectionService, ConnectionStatus } from '@/lib/services/connection';

describe('ConnectionService', () => {
  describe('checkConnection', () => {
    it('returns connected with version on success', async () => {
      const mockClient = {
        getVersion: vi.fn().mockResolvedValue({ version: '1.37.0', enabledFeatures: [] }),
      };
      const service = new ConnectionService(mockClient);

      const result = await service.checkConnection();

      expect(result.status).toBe(ConnectionStatus.Connected);
      expect(result.version).toBe('1.37.0');
    });

    it('returns disconnected on RPC error', async () => {
      const mockClient = {
        getVersion: vi.fn().mockRejectedValue(new Error('unreachable')),
      };
      const service = new ConnectionService(mockClient);

      const result = await service.checkConnection();

      expect(result.status).toBe(ConnectionStatus.Disconnected);
      expect(result.version).toBeNull();
      expect(result.error).toBeDefined();
    });
  });
});
