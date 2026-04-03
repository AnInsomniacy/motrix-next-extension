import { describe, it, expect, vi } from 'vitest';
import { PermissionService } from '@/lib/services/permission';

describe('PermissionService', () => {
  describe('hasEnhanced', () => {
    it('returns true when all enhanced permissions are granted', async () => {
      const mockApi = {
        contains: vi.fn().mockResolvedValue(true),
      };
      const service = new PermissionService(mockApi);

      const result = await service.hasEnhanced();
      expect(result).toBe(true);
    });

    it('returns false when enhanced permissions are not granted', async () => {
      const mockApi = {
        contains: vi.fn().mockResolvedValue(false),
      };
      const service = new PermissionService(mockApi);

      const result = await service.hasEnhanced();
      expect(result).toBe(false);
    });
  });

  describe('requestEnhanced', () => {
    it('returns true when user grants permissions', async () => {
      const mockApi = {
        contains: vi.fn().mockResolvedValue(false),
        request: vi.fn().mockResolvedValue(true),
      };
      const service = new PermissionService(mockApi);

      const result = await service.requestEnhanced();
      expect(result).toBe(true);
      expect(mockApi.request).toHaveBeenCalledWith(
        expect.objectContaining({
          permissions: expect.arrayContaining(['cookies']),
        }),
      );
    });

    it('returns false when user denies permissions', async () => {
      const mockApi = {
        contains: vi.fn().mockResolvedValue(false),
        request: vi.fn().mockResolvedValue(false),
      };
      const service = new PermissionService(mockApi);

      const result = await service.requestEnhanced();
      expect(result).toBe(false);
    });
  });

  describe('revokeEnhanced', () => {
    it('revokes enhanced permissions', async () => {
      const mockApi = {
        contains: vi.fn().mockResolvedValue(true),
        remove: vi.fn().mockResolvedValue(true),
      };
      const service = new PermissionService(mockApi);

      await service.revokeEnhanced();
      expect(mockApi.remove).toHaveBeenCalled();
    });
  });
});
