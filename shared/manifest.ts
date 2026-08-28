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
    gecko_android?: {
      strict_min_version: string;
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
  'nativeMessaging',
] as const;
const FIREFOX_REQUIRED_PERMISSIONS = [...REQUIRED_PERMISSIONS, 'webRequestBlocking'] as const;
const LOOPBACK_HOST_PERMISSIONS = ['http://127.0.0.1/*', 'http://localhost/*'] as const;
const BROAD_DOWNLOAD_ORIGINS = ['https://*/*', 'http://*/*'] as const;

export function buildExtensionManifest(browser: ExtensionBrowser): ExtensionManifest {
  const optionalPermissions = browser === 'firefox' ? [] : ['downloads.ui'];
  const permissions =
    browser === 'firefox' ? [...FIREFOX_REQUIRED_PERMISSIONS] : [...REQUIRED_PERMISSIONS];

  return {
    name: '__MSG_ext_name__',
    description: '__MSG_ext_description__',
    default_locale: 'en',
    permissions,
    optional_permissions: optionalPermissions,
    host_permissions: [...LOOPBACK_HOST_PERMISSIONS, ...BROAD_DOWNLOAD_ORIGINS],
    optional_host_permissions: [],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'motrix-next-extension@aninsomniacy.dev',
              strict_min_version: '140.0',
              data_collection_permissions: {
                required: ['none'],
              },
            },
            gecko_android: {
              strict_min_version: '142.0',
            },
          },
        }
      : {}),
  };
}
