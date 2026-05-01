export type ExtensionBrowser = 'chromium' | 'firefox' | string;

export interface ExtensionManifest {
  name: string;
  description: string;
  default_locale: string;
  permissions: string[];
  optional_permissions: string[];
  host_permissions: string[];
  optional_host_permissions: string[];
  browser_specific_settings?: {
    gecko: {
      id: string;
      strict_min_version: string;
      data_collection_permissions: {
        required: string[];
      };
    };
  };
}

const REQUIRED_PERMISSIONS = [
  'downloads',
  'storage',
  'contextMenus',
  'notifications',
  'webRequest',
  'cookies',
] as const;
const LOOPBACK_HOST_PERMISSIONS = ['http://127.0.0.1/*', 'http://localhost/*'] as const;
const BROAD_DOWNLOAD_ORIGINS = ['https://*/*', 'http://*/*'] as const;

export function buildExtensionManifest(browser: ExtensionBrowser): ExtensionManifest {
  const optionalPermissions = browser === 'firefox' ? [] : ['downloads.ui'];

  return {
    name: '__MSG_ext_name__',
    description: '__MSG_ext_description__',
    default_locale: 'en',
    permissions: [...REQUIRED_PERMISSIONS],
    optional_permissions: optionalPermissions,
    host_permissions: [...LOOPBACK_HOST_PERMISSIONS, ...BROAD_DOWNLOAD_ORIGINS],
    optional_host_permissions: [],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'motrix-next-extension@aninsomniacy.dev',
              strict_min_version: '128.0',
              data_collection_permissions: {
                required: ['none'],
              },
            },
          },
        }
      : {}),
  };
}
