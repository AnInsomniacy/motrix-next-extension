import type { DownloadSettings, ConnectionConfig, UiPrefs } from './types';

export const DEFAULT_CONNECTION_CONFIG: Readonly<ConnectionConfig> = {
  port: 29110,
  secret: '',
} as const;

export const DEFAULT_DOWNLOAD_SETTINGS: Readonly<DownloadSettings> = {
  enabled: true,
  hideDownloadBar: false,
  desktopUnavailable: {
    action: 'launch',
    startupTimeoutSeconds: 15,
  },
  forwardRequestHeaders: true,
  forwardCookies: true,
  duplicateGuard: {
    enabled: true,
    windowSeconds: 10,
  },
  minimumFileSize: {
    enabled: false,
    sizeMb: 5,
    unknownSizeAction: 'intercept',
  },
  fileExtensionRule: {
    enabled: false,
    extensions: [],
    listedAction: 'skip',
    unknownAction: 'intercept',
  },
  interceptionScope: {
    browserDownloads: true,
    magnet: true,
    ed2k: true,
    thunder: true,
  },
} as const;

export const DEFAULT_UI_PREFS: Readonly<UiPrefs> = {
  theme: 'system',
  colorScheme: 'amber',
  locale: 'auto',
} as const;

/** Maximum number of diagnostic events to retain in storage. */
export const MAX_DIAGNOSTIC_EVENTS = 100;

/** Short timeout for local API reachability checks. */
export const API_CONNECTIVITY_TIMEOUT_MS = 500;

/** Timeout for API requests that perform real work. */
export const API_REQUEST_TIMEOUT_MS = 5000;

/** Number of retry attempts for failed API calls. */
export const API_MAX_RETRIES = 1;

/** URL schemes that the extension can intercept. */
export const INTERCEPTABLE_SCHEMES = ['http:', 'https:', 'ftp:'] as const;

/** The custom protocol for launching Motrix Next desktop app. */
export const MOTRIX_NEXT_PROTOCOL = 'motrixnext' as const;
