import type { Browser } from 'wxt/browser';

export type RuntimePermissionSet = Browser.permissions.Permissions;

export interface PermissionsApi {
  contains: (permissions: RuntimePermissionSet) => Promise<boolean>;
  request: (permissions: RuntimePermissionSet) => Promise<boolean>;
}

const COOKIE_FORWARDING_PERMISSION: RuntimePermissionSet = {
  permissions: ['cookies'],
  origins: ['https://*/*', 'http://*/*'],
};

const DOWNLOAD_UI_PERMISSION: RuntimePermissionSet = {
  permissions: ['downloads.ui'],
};

export class PermissionService {
  constructor(private readonly api: PermissionsApi) {}

  hasCookieForwardingAccess(): Promise<boolean> {
    return this.api.contains(COOKIE_FORWARDING_PERMISSION);
  }

  async requestCookieForwardingAccess(): Promise<boolean> {
    if (await this.hasCookieForwardingAccess()) {
      return true;
    }
    return this.api.request(COOKIE_FORWARDING_PERMISSION);
  }

  hasDownloadUiAccess(): Promise<boolean> {
    return this.api.contains(DOWNLOAD_UI_PERMISSION);
  }

  requestDownloadUiAccess(): Promise<boolean> {
    return this.api.request(DOWNLOAD_UI_PERMISSION);
  }
}
