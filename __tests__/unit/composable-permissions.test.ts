import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEnhancedPermissions } from '@/entrypoints/options/composables/use-enhanced-permissions';

// ─── Chrome API Mock ────────────────────────────────────
// useEnhancedPermissions accesses the global `chrome.permissions` API.
// We must provide a mock before the composable is invoked.

const mockContains = vi.fn<(p: chrome.permissions.Permissions) => Promise<boolean>>();
const mockRequest = vi.fn<(p: chrome.permissions.Permissions) => Promise<boolean>>();
const mockRemove = vi.fn<(p: chrome.permissions.Permissions) => Promise<boolean>>();

beforeEach(() => {
  vi.stubGlobal('chrome', {
    permissions: {
      contains: mockContains,
      request: mockRequest,
      remove: mockRemove,
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ─── Tests ──────────────────────────────────────────────

describe('useEnhancedPermissions', () => {
  it('starts with enhancedGranted = false', () => {
    const { enhancedGranted } = useEnhancedPermissions();
    expect(enhancedGranted.value).toBe(false);
  });

  it('checkPermissions() sets enhancedGranted = true when contains() resolves true', async () => {
    mockContains.mockResolvedValue(true);
    const { enhancedGranted, checkPermissions } = useEnhancedPermissions();

    await checkPermissions();

    expect(enhancedGranted.value).toBe(true);
    expect(mockContains).toHaveBeenCalledWith({
      permissions: ['cookies', 'downloads.ui'],
      origins: ['https://*/*', 'http://*/*'],
    });
  });

  it('checkPermissions() sets enhancedGranted = false when contains() throws', async () => {
    mockContains.mockRejectedValue(new Error('denied'));
    const { enhancedGranted, checkPermissions } = useEnhancedPermissions();

    await checkPermissions();

    expect(enhancedGranted.value).toBe(false);
  });

  it('grantEnhanced() calls request() and sets enhancedGranted on success', async () => {
    mockRequest.mockResolvedValue(true);
    const { enhancedGranted, grantEnhanced } = useEnhancedPermissions();

    await grantEnhanced();

    expect(enhancedGranted.value).toBe(true);
    expect(mockRequest).toHaveBeenCalled();
  });

  it('grantEnhanced() sets false when request() rejects', async () => {
    mockRequest.mockRejectedValue(new Error('user denied'));
    const { enhancedGranted, grantEnhanced } = useEnhancedPermissions();

    await grantEnhanced();

    expect(enhancedGranted.value).toBe(false);
  });

  it('revokeEnhanced() calls remove() and sets enhancedGranted = false', async () => {
    // First grant
    mockRequest.mockResolvedValue(true);
    const { enhancedGranted, grantEnhanced, revokeEnhanced } = useEnhancedPermissions();
    await grantEnhanced();
    expect(enhancedGranted.value).toBe(true);

    // Then revoke
    mockRemove.mockResolvedValue(true);
    await revokeEnhanced();
    expect(enhancedGranted.value).toBe(false);
    expect(mockRemove).toHaveBeenCalled();
  });
});
