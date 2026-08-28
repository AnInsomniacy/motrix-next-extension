export type ExtensionBrowser = 'chromium' | 'firefox' | string;

export interface ExtensionManifest {
  name: string;
  description: string;
  default_locale: string;
  key?: string;
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

export const CHROME_EXTENSION_ID = 'ofeajdebdjajhkmcmamagokecnbephhl';
export const CHROME_EXTENSION_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxCnWi95LaR4hmUK5XWjZ1ukXDuzdsYOW4u+YCXDCK2xY4KvgO9zZPaJyfk1+cQjYyItGoaCPUleSF3ITE3nIHdEXfU9fYO8a2e0lbdn5YCWsUWI1KdU/hGjqxACWspkSfV2DAyWqaALQWM2bsMBBJSBbLCrXTpIJ4YPiEXHq8h+spEhjGh119rBzc+CUYq55o/oSgIumLdpwEdnQDIUDSnSv29M7BZyLNDSvEI/4CC/hrJKNARAZyms6yYt18UDxsOLO3Lo9rEVQCZbFzCemfPUsGOFSqR4c2bHI40sK1/ilLAKJk5YL38JX/n92PGDl/9e2cZmACD59DkuHqrnkqQIDAQAB';

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

export function buildExtensionManifest(browser: ExtensionBrowser, mode: string): ExtensionManifest {
  const optionalPermissions = browser === 'firefox' ? [] : ['downloads.ui'];
  const permissions =
    browser === 'firefox' ? [...FIREFOX_REQUIRED_PERMISSIONS] : [...REQUIRED_PERMISSIONS];

  return {
    name: '__MSG_ext_name__',
    description: '__MSG_ext_description__',
    default_locale: 'en',
    ...(browser !== 'firefox' && mode === 'development'
      ? { key: CHROME_EXTENSION_PUBLIC_KEY }
      : {}),
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
