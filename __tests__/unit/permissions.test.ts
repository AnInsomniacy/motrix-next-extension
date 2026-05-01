import { describe, expect, it, vi } from 'vitest';
import { PermissionService } from '@/lib/services/permissions';

function createApi() {
  return {
    contains:
      vi.fn<(permissions: { permissions?: string[]; origins?: string[] }) => Promise<boolean>>(),
    request:
      vi.fn<(permissions: { permissions?: string[]; origins?: string[] }) => Promise<boolean>>(),
  };
}

describe('PermissionService', () => {
  it('checks cookie forwarding as cookies plus broad HTTP origins', async () => {
    const api = createApi();
    api.contains.mockResolvedValue(true);
    const service = new PermissionService(api);

    await expect(service.hasCookieForwardingAccess()).resolves.toBe(true);

    expect(api.contains).toHaveBeenCalledWith({
      permissions: ['cookies'],
      origins: ['https://*/*', 'http://*/*'],
    });
  });

  it('uses existing required cookie forwarding permissions without prompting', async () => {
    const api = createApi();
    api.contains.mockResolvedValue(true);
    const service = new PermissionService(api);

    await expect(service.requestCookieForwardingAccess()).resolves.toBe(true);

    expect(api.contains).toHaveBeenCalledWith({
      permissions: ['cookies'],
      origins: ['https://*/*', 'http://*/*'],
    });
    expect(api.request).not.toHaveBeenCalled();
  });

  it('falls back to one atomic runtime grant when cookie forwarding permissions are missing', async () => {
    const api = createApi();
    api.contains.mockResolvedValue(false);
    api.request.mockResolvedValue(true);
    const service = new PermissionService(api);

    await expect(service.requestCookieForwardingAccess()).resolves.toBe(true);

    expect(api.request).toHaveBeenCalledWith({
      permissions: ['cookies'],
      origins: ['https://*/*', 'http://*/*'],
    });
  });

  it('checks the downloads.ui permission separately from download interception', async () => {
    const api = createApi();
    api.contains.mockResolvedValue(false);
    const service = new PermissionService(api);

    await expect(service.hasDownloadUiAccess()).resolves.toBe(false);

    expect(api.contains).toHaveBeenCalledWith({ permissions: ['downloads.ui'] });
  });
});
