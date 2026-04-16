// ─── Types ──────────────────────────────────────────────

interface PermissionsApi {
  contains: (query: PermissionQuery) => Promise<boolean>;
  request?: (query: PermissionQuery) => Promise<boolean>;
  remove?: (query: PermissionQuery) => Promise<boolean>;
}

interface PermissionQuery {
  permissions?: string[];
  origins?: string[];
}

// Enhanced permissions differ per browser: downloads.ui is Chromium-only
// (used for setUiOptions to hide the download bar). Firefox does not
// support this permission, so it must be excluded to prevent errors.
const ENHANCED_QUERY: PermissionQuery = {
  permissions: import.meta.env.FIREFOX ? ['cookies'] : ['cookies', 'downloads.ui'],
  origins: ['https://*/*', 'http://*/*'],
};

// ─── Service ────────────────────────────────────────────

/**
 * Manages optional enhanced permissions.
 * Wraps chrome.permissions API via dependency injection.
 */
export class PermissionService {
  private readonly api: PermissionsApi;

  constructor(api: PermissionsApi) {
    this.api = api;
  }

  /** Check whether all enhanced permissions are currently granted. */
  async hasEnhanced(): Promise<boolean> {
    return this.api.contains(ENHANCED_QUERY);
  }

  /** Request enhanced permissions from the user. Must be called from a user gesture. */
  async requestEnhanced(): Promise<boolean> {
    if (!this.api.request) return false;
    return this.api.request(ENHANCED_QUERY);
  }

  /** Revoke enhanced permissions. */
  async revokeEnhanced(): Promise<void> {
    if (this.api.remove) {
      await this.api.remove(ENHANCED_QUERY);
    }
  }
}
